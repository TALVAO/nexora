import type { Channel, AutomationMode } from "@nexora/shared";
import type {
  MessagingProvider,
  NormalizedMessage,
  SendResult,
  DeliveryStatus,
  MessageType,
} from "../types.js";
import { EvolutionWhatsAppProvider } from "../providers/evolution.provider.js";
import { MetaWhatsAppCloudProvider } from "../providers/meta-cloud.provider.js";
import { InstagramMessagingProvider } from "../providers/instagram.provider.js";
import { MockMessagingProvider } from "../providers/mock.provider.js";
import {
  type TenantContext,
  assertTenantContext,
  MessageRepository,
  FollowupRepository,
  LeadRepository,
  query,
  type LeadRow,
  type ConversationRow,
  type MessageRow,
} from "@nexora/database";
import {
  ConversationEngine,
  GeminiClient,
  summarizeConversation,
  type GeneratedResponse,
  type ExtractedLeadProfile,
} from "@nexora/ai";
import { VocabularyRepository } from "@nexora/database";

export interface ProcessedInboundResult {
  isDuplicate: boolean;
  lead: LeadRow;
  conversation: ConversationRow;
  message: MessageRow;
  automationMode: AutomationMode;
  aiResponse?: GeneratedResponse;
  outboundMessage?: MessageRow;
}

export interface SendOutboundInput {
  text?: string;
  mediaUrl?: string;
  type?: MessageType;
  caption?: string;
  senderType?: "USER" | "AI" | "SYSTEM";
}

export interface SendOutboundResult {
  success: boolean;
  message?: MessageRow;
  error?: string;
}

export class MessageGateway {
  private providers: Map<string, MessagingProvider> = new Map();
  private messageRepo: MessageRepository;
  private conversationEngine: ConversationEngine;
  private followupRepo: FollowupRepository;
  private vocabularyRepo: VocabularyRepository;
  private leadRepo: LeadRepository;
  private geminiClient: GeminiClient;

  constructor(dependencies?: {
    messageRepo?: MessageRepository;
    conversationEngine?: ConversationEngine;
    followupRepo?: FollowupRepository;
    vocabularyRepo?: VocabularyRepository;
    leadRepo?: LeadRepository;
    geminiClient?: GeminiClient;
  }) {
    this.messageRepo = dependencies?.messageRepo || new MessageRepository();
    this.conversationEngine = dependencies?.conversationEngine || new ConversationEngine();
    this.followupRepo = dependencies?.followupRepo || new FollowupRepository();
    this.vocabularyRepo = dependencies?.vocabularyRepo || new VocabularyRepository();
    this.leadRepo = dependencies?.leadRepo || new LeadRepository();
    this.geminiClient = dependencies?.geminiClient || new GeminiClient();

    // Register standard providers
    this.registerProvider("WHATSAPP", "evolution", new EvolutionWhatsAppProvider());
    this.registerProvider("WHATSAPP", "meta_cloud", new MetaWhatsAppCloudProvider());
    this.registerProvider("INSTAGRAM", "instagram_graph", new InstagramMessagingProvider());
    this.registerProvider("WHATSAPP", "mock", new MockMessagingProvider());
    this.registerProvider("INSTAGRAM", "mock", new MockMessagingProvider());
  }

  registerProvider(channel: Channel, providerName: string, provider: MessagingProvider): void {
    const key = `${channel}:${providerName}`.toLowerCase();
    this.providers.set(key, provider);
  }

  getProvider(channel: Channel, providerName: string): MessagingProvider {
    const key = `${channel}:${providerName}`.toLowerCase();
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`Provider não suportado ou não registrado: ${channel}/${providerName}`);
    }
    return provider;
  }

  normalizeInbound(
    channel: Channel,
    providerName: string,
    rawPayload: unknown,
    tenantId: string,
  ): NormalizedMessage {
    const provider = this.getProvider(channel, providerName);
    const normalized = provider.normalizeInbound(rawPayload, tenantId);
    normalized.tenantId = tenantId;
    return normalized;
  }

  async processInbound(
    ctx: TenantContext,
    normalized: NormalizedMessage,
  ): Promise<ProcessedInboundResult> {
    assertTenantContext(ctx);

    // 1. Resolve or Create Lead
    const lead = await this.resolveOrCreateLead(ctx, normalized);

    // 2. Resolve or Create Conversation
    const conversation = await this.resolveOrCreateConversation(ctx, lead.id, normalized);

    // 3. Persist message with Idempotency check
    const { message, isDuplicate } = await this.messageRepo.create(ctx, {
      conversation_id: conversation.id,
      lead_id: lead.id,
      external_message_id: normalized.externalMessageId,
      direction: normalized.direction,
      sender_type: normalized.direction === "INBOUND" ? "LEAD" : "USER",
      message_type: normalized.type,
      text: normalized.text,
      media_url: normalized.mediaUrl,
      provider_status: "RECEIVED",
    });

    if (isDuplicate) {
      return {
        isDuplicate: true,
        lead,
        conversation,
        message,
        automationMode: lead.automation_mode,
      };
    }

    // 4. Update Timestamps on Lead & Conversation
    await query(
      `UPDATE leads SET last_inbound_at = $1, updated_at = $1 WHERE id = $2 AND tenant_id = $3;`,
      [normalized.timestamp, lead.id, ctx.tenantId],
    );

    await query(
      `UPDATE conversations SET last_message_at = $1, updated_at = $1 WHERE id = $2 AND tenant_id = $3;`,
      [normalized.timestamp, conversation.id, ctx.tenantId],
    );

    // 5. STOP CONDITION: Cancel all pending follow-up jobs for this lead because lead replied!
    if (normalized.direction === "INBOUND") {
      await this.followupRepo.cancelJobsForLead(
        ctx,
        lead.id,
        "Lead respondeu antes do envio do follow-up",
      );
    }

    let aiResponse: GeneratedResponse | undefined;
    let outboundMessage: MessageRow | undefined;
    let currentMode = lead.automation_mode;

    // 6. Conversation Engine + IA Processing
    if (lead.automation_mode === "AI" && normalized.direction === "INBOUND" && normalized.text) {
      // Geografia e vocabulário vêm do tenant, nunca de lista fixa no código.
      // Falha ao carregar não pode derrubar o atendimento: a extração continua
      // funcionando para orçamento, quartos, vagas e prazo.
      let vocabulary;
      try {
        vocabulary = await this.vocabularyRepo.loadVocabulary(ctx);
      } catch (err) {
        console.error("[Gateway] Falha ao carregar vocabulário do tenant:", err);
      }

      const aiResult = this.conversationEngine.processMessage({
        tenantId: ctx.tenantId,
        leadId: lead.id,
        conversationId: conversation.id,
        lastMessageText: normalized.text,
        vocabulary,
      });

      aiResponse = aiResult.response;

      // Audit log in PostgreSQL ai_runs
      await query(
        `
        INSERT INTO ai_runs (
          tenant_id,
          lead_id,
          conversation_id,
          purpose,
          provider,
          model,
          input_tokens,
          output_tokens,
          latency_ms,
          confidence,
          result_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `,
        [
          ctx.tenantId,
          lead.id,
          conversation.id,
          "CONVERSATION_TURN",
          "rule_engine_v1",
          aiResult.aiRun.model,
          aiResult.aiRun.promptTokens,
          aiResult.aiRun.completionTokens,
          aiResult.aiRun.latencyMs,
          aiResult.aiRun.confidence,
          JSON.stringify({
            intent: aiResponse.intent,
            extracted: aiResponse.extractedProfile,
            decision: aiResponse.nextAction,
          }),
        ],
      );

      // Handle Handoff or Opt-Out
      if (aiResponse.shouldHandoff) {
        currentMode = "HUMAN";
        await query(
          `UPDATE leads SET automation_mode = 'HUMAN', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
          [lead.id, ctx.tenantId],
        );
        await query(
          `UPDATE conversations SET automation_mode = 'HUMAN', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
          [conversation.id, ctx.tenantId],
        );
      } else if (aiResponse.intent === "STOP_MESSAGES") {
        currentMode = "HUMAN";
        await query(
          `UPDATE leads SET automation_mode = 'HUMAN', stage = 'LOST', lost_reason = 'Opt-out solicitado pelo cliente', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
          [lead.id, ctx.tenantId],
        );
      }

      // Update lead intent and lead_profiles facts
      if (aiResponse.intent) {
        await query(
          `UPDATE leads SET intent = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3;`,
          [aiResponse.intent, lead.id, ctx.tenantId],
        );
      }

      const p = aiResponse.extractedProfile;
      await query(
        `
        INSERT INTO lead_profiles (
          tenant_id,
          lead_id,
          transaction_type,
          property_type,
          city,
          neighborhoods,
          max_budget,
          bedrooms,
          parking_spaces,
          pet_required,
          rental_guarantee,
          structured_preferences_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, lead_id) DO UPDATE SET
          transaction_type = COALESCE(EXCLUDED.transaction_type, lead_profiles.transaction_type),
          property_type = COALESCE(EXCLUDED.property_type, lead_profiles.property_type),
          city = COALESCE(EXCLUDED.city, lead_profiles.city),
          neighborhoods = CASE WHEN array_length(EXCLUDED.neighborhoods, 1) > 0 THEN EXCLUDED.neighborhoods ELSE lead_profiles.neighborhoods END,
          max_budget = COALESCE(EXCLUDED.max_budget, lead_profiles.max_budget),
          bedrooms = COALESCE(EXCLUDED.bedrooms, lead_profiles.bedrooms),
          parking_spaces = COALESCE(EXCLUDED.parking_spaces, lead_profiles.parking_spaces),
          pet_required = COALESCE(EXCLUDED.pet_required, lead_profiles.pet_required),
          rental_guarantee = COALESCE(EXCLUDED.rental_guarantee, lead_profiles.rental_guarantee),
          structured_preferences_json = EXCLUDED.structured_preferences_json,
          updated_at = now();
      `,
        [
          ctx.tenantId,
          lead.id,
          p.transactionType || null,
          p.propertyType || null,
          p.city || null,
          p.neighborhoods && p.neighborhoods.length > 0 ? p.neighborhoods : [],
          p.maxBudget || null,
          p.bedrooms || null,
          p.parkingSpaces || null,
          p.hasPet || null,
          p.rentalGuarantee || null,
          JSON.stringify(p),
        ],
      );

      // Auto-send response message
      if (aiResponse.text) {
        const sendRes = await this.sendOutbound(ctx, conversation.id, {
          text: aiResponse.text,
          senderType: "AI",
        });
        if (sendRes.success) {
          outboundMessage = sendRes.message;
        }
      }
    }

    return {
      isDuplicate: false,
      lead,
      conversation,
      message,
      automationMode: currentMode,
      aiResponse,
      outboundMessage,
    };
  }

  async sendOutbound(
    ctx: TenantContext,
    conversationId: string,
    input: SendOutboundInput,
  ): Promise<SendOutboundResult> {
    assertTenantContext(ctx);

    // 1. Find Conversation & Lead
    const convRes = await query<ConversationRow>(
      `SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2 LIMIT 1;`,
      [conversationId, ctx.tenantId],
    );
    const conversation = convRes.rows[0];
    if (!conversation) {
      return { success: false, error: "Conversa não encontrada para este tenant." };
    }

    const leadRes = await query<LeadRow>(
      `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1;`,
      [conversation.lead_id, ctx.tenantId],
    );
    const lead = leadRes.rows[0];
    if (!lead) {
      return { success: false, error: "Lead não encontrado para esta conversa." };
    }

    const recipient = lead.phone || conversation.external_conversation_id || "";
    if (!recipient) {
      return { success: false, error: "Destinatário inválido ou telefone ausente." };
    }

    // 2. Dispatch to Channel Provider
    const provider = this.getProvider(conversation.channel, conversation.provider);
    let sendResult: SendResult;

    if (input.mediaUrl) {
      sendResult = await provider.sendMedia({
        tenantId: ctx.tenantId,
        to: recipient,
        mediaUrl: input.mediaUrl,
        type: (input.type?.toLowerCase() as "image" | "audio" | "video" | "document") || "image",
        caption: input.caption || input.text,
      });
    } else {
      sendResult = await provider.sendText({
        tenantId: ctx.tenantId,
        to: recipient,
        text: input.text || "",
      });
    }

    if (!sendResult.success) {
      return {
        success: false,
        error: sendResult.error || "Falha ao enviar mensagem pelo provedor.",
      };
    }

    // 3. Persist Outbound Message
    const externalMessageId = sendResult.externalMessageId || `out_${Date.now()}`;
    const { message } = await this.messageRepo.create(ctx, {
      conversation_id: conversation.id,
      lead_id: lead.id,
      external_message_id: externalMessageId,
      direction: "OUTBOUND",
      sender_type: input.senderType || "USER",
      message_type: input.type || (input.mediaUrl ? "IMAGE" : "TEXT"),
      text: input.text,
      media_url: input.mediaUrl,
      provider_status: "SENT",
    });

    // 4. Update Timestamps
    const now = new Date().toISOString();
    await query(
      `UPDATE leads SET last_outbound_at = $1, updated_at = $1 WHERE id = $2 AND tenant_id = $3;`,
      [now, lead.id, ctx.tenantId],
    );
    await query(
      `UPDATE conversations SET last_message_at = $1, updated_at = $1 WHERE id = $2 AND tenant_id = $3;`,
      [now, conversation.id, ctx.tenantId],
    );

    return {
      success: true,
      message,
    };
  }

  async updateDeliveryStatus(
    ctx: TenantContext,
    externalMessageId: string,
    status: DeliveryStatus["status"],
  ): Promise<boolean> {
    assertTenantContext(ctx);

    const now = new Date().toISOString();
    let timestampField = "";
    if (status === "DELIVERED") timestampField = ", delivered_at = $3";
    if (status === "READ") timestampField = ", read_at = $3";

    const sql = `
      UPDATE messages
      SET provider_status = $1 ${timestampField}
      WHERE tenant_id = $2 AND external_message_id = $3;
    `;

    const result = await query(sql, [status, ctx.tenantId, externalMessageId, now]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Corretor assume manualmente o atendimento (Etapa 14.2). A ordem importa:
   * a IA sai do ar (assumeControl) e os follow-ups pendentes são cancelados
   * ANTES do resumo ser gerado — o resumo é só um extra para o corretor ler,
   * nunca pode bloquear nem reverter o takeover em si (CLAUDE.md §25: a IA
   * não confirma uma ação que o backend não confirmou de verdade).
   */
  async assumeConversation(
    ctx: TenantContext,
    leadId: string,
  ): Promise<{ lead: LeadRow; cancelledFollowups: number; summary: string } | null> {
    assertTenantContext(ctx);

    const view = await this.leadRepo.findLead360(ctx, leadId);
    if (!view) return null;

    const updatedLead = await this.leadRepo.assumeControl(ctx, leadId);
    if (!updatedLead) return null;

    const cancelledFollowups = await this.followupRepo.cancelJobsForLead(
      ctx,
      leadId,
      "Corretor assumiu a conversa manualmente",
    );

    // Nota de auditoria é complementar, igual ao resumo abaixo: uma falha aqui
    // (ex.: `addActivity` está com o INSERT desalinhado do schema real de
    // `activities` — bug pré-existente, ver memoria.md) não pode reverter nem
    // bloquear um takeover que já foi confirmado no banco (CLAUDE.md §25).
    try {
      await this.leadRepo.addActivity(ctx, leadId, {
        activity_type: "NOTE",
        description: "Corretor assumiu o atendimento manualmente.",
      });
    } catch (err) {
      console.error("[Gateway] Falha ao registrar atividade de takeover:", err);
    }

    // Histórico para a IA: mensagens sem texto (mídia pura) não ajudam o resumo.
    const history = view.recentMessages
      .filter((m): m is MessageRow & { text: string } => !!m.text)
      .map((m) => ({
        role: (m.direction === "INBOUND" ? "lead" : "assistant") as "lead" | "assistant",
        text: m.text,
      }));

    const profile: ExtractedLeadProfile | undefined = view.profile
      ? {
          transactionType: (view.profile.transaction_type as "RENT" | "BUY" | null) ?? null,
          propertyType: view.profile.property_type ?? null,
          city: view.profile.city ?? null,
          neighborhoods: view.profile.neighborhoods ?? [],
          maxBudget: view.profile.max_budget ?? null,
          bedrooms: view.profile.bedrooms ?? null,
          parkingSpaces: view.profile.parking_spaces ?? null,
          hasPet: view.profile.pet_required ?? null,
          moveDate: view.profile.move_date ?? null,
          rentalGuarantee: view.profile.rental_guarantee ?? null,
        }
      : undefined;

    const { text: summary, source } = await summarizeConversation(
      { leadName: view.lead.name, profile, history },
      this.geminiClient,
    );

    // Audit log em ai_runs, igual ao restante deste arquivo. conversation_id
    // fica NULL: o resumo cobre todos os canais do lead, não uma conversa só.
    await query(
      `
      INSERT INTO ai_runs (
        tenant_id,
        lead_id,
        conversation_id,
        purpose,
        provider,
        model,
        result_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `,
      [
        ctx.tenantId,
        leadId,
        null,
        "CONVERSATION_SUMMARY",
        source === "AI" ? "gemini" : "fallback_heuristic",
        source === "AI" ? "gemini" : "heuristic_v1",
        JSON.stringify({ summary }),
      ],
    );

    return { lead: updatedLead, cancelledFollowups, summary };
  }

  private async resolveOrCreateLead(
    ctx: TenantContext,
    normalized: NormalizedMessage,
  ): Promise<LeadRow> {
    const isWhatsApp = normalized.channel === "WHATSAPP";
    const lookupField = isWhatsApp ? "phone" : "instagram_user_id";

    const lookupSql = `
      SELECT * FROM leads
      WHERE tenant_id = $1 AND ${lookupField} = $2
      LIMIT 1;
    `;
    const existing = await query<LeadRow>(lookupSql, [ctx.tenantId, normalized.externalUserId]);
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    // Create new lead in NEW stage
    const insertSql = `
      INSERT INTO leads (
        tenant_id,
        ${lookupField},
        source,
        stage,
        temperature,
        score,
        automation_mode,
        first_contact_at,
        last_inbound_at
      ) VALUES ($1, $2, $3, 'NEW', 'COLD', 0, 'AI', $4, $4)
      RETURNING *;
    `;
    const created = await query<LeadRow>(insertSql, [
      ctx.tenantId,
      normalized.externalUserId,
      normalized.channel,
      normalized.timestamp,
    ]);

    const row = created.rows[0];
    if (!row) throw new Error("Falha ao resolver ou criar lead.");
    return row;
  }

  private async resolveOrCreateConversation(
    ctx: TenantContext,
    leadId: string,
    normalized: NormalizedMessage,
  ): Promise<ConversationRow> {
    const lookupSql = `
      SELECT * FROM conversations
      WHERE tenant_id = $1 AND lead_id = $2 AND channel = $3 AND status = 'OPEN'
      LIMIT 1;
    `;
    const existing = await query<ConversationRow>(lookupSql, [
      ctx.tenantId,
      leadId,
      normalized.channel,
    ]);
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const insertSql = `
      INSERT INTO conversations (
        tenant_id,
        lead_id,
        channel,
        provider,
        external_conversation_id,
        status,
        automation_mode,
        last_message_at
      ) VALUES ($1, $2, $3, $4, $5, 'OPEN', 'AI', $6)
      RETURNING *;
    `;
    const created = await query<ConversationRow>(insertSql, [
      ctx.tenantId,
      leadId,
      normalized.channel,
      normalized.provider,
      normalized.externalConversationId || normalized.externalUserId,
      normalized.timestamp,
    ]);

    const row = created.rows[0];
    if (!row) throw new Error("Falha ao resolver ou criar conversa.");
    return row;
  }
}
