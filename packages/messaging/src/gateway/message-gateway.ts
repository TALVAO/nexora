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
  query,
  type LeadRow,
  type ConversationRow,
  type MessageRow,
} from "@nexora/database";

export interface ProcessedInboundResult {
  isDuplicate: boolean;
  lead: LeadRow;
  conversation: ConversationRow;
  message: MessageRow;
  automationMode: AutomationMode;
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

  constructor(dependencies?: { messageRepo?: MessageRepository }) {
    this.messageRepo = dependencies?.messageRepo || new MessageRepository();

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

    return {
      isDuplicate: false,
      lead,
      conversation,
      message,
      automationMode: lead.automation_mode,
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
