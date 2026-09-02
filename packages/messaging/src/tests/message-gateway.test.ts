import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageGateway } from "../gateway/message-gateway.js";
import {
  LeadRepository,
  MessageRepository,
  FollowupRepository,
  type LeadRow,
  type ConversationRow,
  type MessageRow,
  type Lead360View,
} from "@nexora/database";
import * as dbClient from "@nexora/database";
import { GeminiClient } from "@nexora/ai";

describe("MessageGateway Core Pipeline", () => {
  let gateway: MessageGateway;
  let mockLeadRepo: LeadRepository;
  let mockMessageRepo: MessageRepository;
  let mockFollowupRepo: FollowupRepository;

  const tenantCtx = { tenantId: "tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };

  beforeEach(() => {
    mockLeadRepo = new LeadRepository();
    mockMessageRepo = new MessageRepository();
    mockFollowupRepo = new FollowupRepository();
    mockFollowupRepo.cancelJobsForLead = vi.fn().mockResolvedValue(0);
    gateway = new MessageGateway({
      leadRepo: mockLeadRepo,
      messageRepo: mockMessageRepo,
      followupRepo: mockFollowupRepo,
    });
  });

  it("should process inbound message, creating lead, conversation and persisting message", async () => {
    const fakeLead: LeadRow = {
      id: "lead-001",
      tenant_id: tenantCtx.tenantId,
      assigned_user_id: null,
      name: null,
      phone: "5511999887766",
      instagram_user_id: null,
      email: null,
      source: "WHATSAPP",
      intent: null,
      stage: "NEW",
      temperature: "COLD",
      score: 0,
      automation_mode: "AI",
      first_contact_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
      last_outbound_at: null,
      next_action_at: null,
      lost_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const fakeConversation: ConversationRow = {
      id: "conv-001",
      tenant_id: tenantCtx.tenantId,
      lead_id: fakeLead.id,
      channel: "WHATSAPP",
      provider: "evolution",
      external_conversation_id: "5511999887766@s.whatsapp.net",
      status: "OPEN",
      assigned_user_id: null,
      automation_mode: "AI",
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const fakeMessage: MessageRow = {
      id: "msg-001",
      tenant_id: tenantCtx.tenantId,
      conversation_id: fakeConversation.id,
      lead_id: fakeLead.id,
      external_message_id: "evo_msg_999",
      direction: "INBOUND",
      sender_type: "LEAD",
      message_type: "TEXT",
      text: "Olá!",
      media_url: null,
      provider_status: "RECEIVED",
      ai_generated: false,
      ai_run_id: null,
      sent_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    const querySpy = vi.spyOn(dbClient, "query").mockImplementation(async (sql) => {
      if (sql.includes("SELECT * FROM leads")) {
        return { rows: [fakeLead], rowCount: 1 };
      }
      if (sql.includes("SELECT * FROM conversations")) {
        return { rows: [fakeConversation], rowCount: 1 };
      }
      if (sql.includes("UPDATE leads") || sql.includes("UPDATE conversations")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const createMessageSpy = vi.spyOn(mockMessageRepo, "create").mockResolvedValue({
      message: fakeMessage,
      isDuplicate: false,
    });

    const normalized = gateway.normalizeInbound(
      "WHATSAPP",
      "evolution",
      {
        event: "messages.upsert",
        data: {
          key: { id: "evo_msg_999", remoteJid: "5511999887766@s.whatsapp.net" },
          message: { conversation: "Olá!" },
        },
      },
      tenantCtx.tenantId,
    );

    const result = await gateway.processInbound(tenantCtx, normalized);

    expect(result.isDuplicate).toBe(false);
    expect(result.lead.id).toBe("lead-001");
    expect(result.conversation.id).toBe("conv-001");
    expect(result.message.id).toBe("msg-001");
    expect(result.automationMode).toBe("AI");

    querySpy.mockRestore();
    createMessageSpy.mockRestore();
  });

  it("should handle duplicate webhook gracefully and return isDuplicate = true", async () => {
    const fakeLead = { id: "lead-001", automation_mode: "AI" } as LeadRow;
    const fakeConv = { id: "conv-001" } as ConversationRow;
    const existingMsg = { id: "msg-001", external_message_id: "dup_msg" } as MessageRow;

    const querySpy = vi.spyOn(dbClient, "query").mockImplementation(async (sql) => {
      if (sql.includes("SELECT * FROM leads")) return { rows: [fakeLead], rowCount: 1 };
      if (sql.includes("SELECT * FROM conversations")) return { rows: [fakeConv], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const createMessageSpy = vi.spyOn(mockMessageRepo, "create").mockResolvedValue({
      message: existingMsg,
      isDuplicate: true,
    });

    const normalized = gateway.normalizeInbound(
      "WHATSAPP",
      "mock",
      { externalMessageId: "dup_msg", text: "Mensagem repetida" },
      tenantCtx.tenantId,
    );

    const result = await gateway.processInbound(tenantCtx, normalized);

    expect(result.isDuplicate).toBe(true);
    expect(result.message.id).toBe("msg-001");

    querySpy.mockRestore();
    createMessageSpy.mockRestore();
  });
});

describe("MessageGateway.assumeConversation (Etapa 14.2)", () => {
  let mockLeadRepo: LeadRepository;
  let mockMessageRepo: MessageRepository;
  let mockFollowupRepo: FollowupRepository;
  let gateway: MessageGateway;

  const tenantCtx = { tenantId: "tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
  const leadId = "lead-777";

  beforeEach(() => {
    mockLeadRepo = new LeadRepository();
    mockMessageRepo = new MessageRepository();
    mockFollowupRepo = new FollowupRepository();
    // apiKey "placeholder-*" nunca configura o cliente (ver GeminiClient.isConfigured) —
    // garante o caminho de fallback determinístico independente do ambiente.
    gateway = new MessageGateway({
      leadRepo: mockLeadRepo,
      messageRepo: mockMessageRepo,
      followupRepo: mockFollowupRepo,
      geminiClient: new GeminiClient({ apiKey: "placeholder-test" }),
    });
  });

  it("should take control, cancel pending followups and return fallback summary, in order", async () => {
    const leadBeforeTakeover: LeadRow = {
      id: leadId,
      tenant_id: tenantCtx.tenantId,
      assigned_user_id: null,
      name: "Maria Souza",
      phone: "5511988776655",
      instagram_user_id: null,
      email: null,
      source: "WHATSAPP",
      intent: "RENTAL_SEARCH",
      stage: "QUALIFYING",
      temperature: "WARM",
      score: 40,
      automation_mode: "AI",
      first_contact_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
      last_outbound_at: null,
      next_action_at: null,
      lost_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const leadAfterTakeover: LeadRow = { ...leadBeforeTakeover, automation_mode: "HUMAN" };

    const fakeMessage: MessageRow = {
      id: "msg-777",
      tenant_id: tenantCtx.tenantId,
      conversation_id: "conv-777",
      lead_id: leadId,
      external_message_id: "ext-777",
      direction: "INBOUND",
      sender_type: "LEAD",
      message_type: "TEXT",
      text: "Quero alugar um apê de 2 quartos em Jundiaí",
      media_url: null,
      provider_status: "RECEIVED",
      ai_generated: false,
      ai_run_id: null,
      sent_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    const fake360: Lead360View = {
      lead: leadBeforeTakeover,
      profile: {
        transaction_type: "RENT",
        property_type: "Apartamento",
        city: "Jundiaí",
        neighborhoods: ["Eloy Chaves"],
        max_budget: 3000,
        bedrooms: 2,
      },
      stageHistory: [],
      activities: [],
      recentMessages: [fakeMessage],
      conversations: [],
    };

    const callOrder: string[] = [];

    const findLead360Spy = vi.spyOn(mockLeadRepo, "findLead360").mockImplementation(async () => {
      callOrder.push("findLead360");
      return fake360;
    });
    const assumeControlSpy = vi.spyOn(mockLeadRepo, "assumeControl").mockImplementation(async () => {
      callOrder.push("assumeControl");
      return leadAfterTakeover;
    });
    const addActivitySpy = vi
      .spyOn(mockLeadRepo, "addActivity")
      .mockResolvedValue({ id: "act-777" });
    mockFollowupRepo.cancelJobsForLead = vi.fn().mockImplementation(async () => {
      callOrder.push("cancelJobsForLead");
      return 3;
    });

    const querySpy = vi.spyOn(dbClient, "query").mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await gateway.assumeConversation(tenantCtx, leadId);

    expect(callOrder).toEqual(["findLead360", "assumeControl", "cancelJobsForLead"]);
    expect(findLead360Spy).toHaveBeenCalledWith(tenantCtx, leadId);
    expect(assumeControlSpy).toHaveBeenCalledWith(tenantCtx, leadId);
    expect(mockFollowupRepo.cancelJobsForLead).toHaveBeenCalledWith(
      tenantCtx,
      leadId,
      "Corretor assumiu a conversa manualmente",
    );
    expect(addActivitySpy).toHaveBeenCalledWith(
      tenantCtx,
      leadId,
      expect.objectContaining({ activity_type: "NOTE" }),
    );

    expect(result).not.toBeNull();
    expect(result?.lead.automation_mode).toBe("HUMAN");
    expect(result?.cancelledFollowups).toBe(3);
    // Sem IA configurada, o resumo vem do fallback determinístico (perfil + última mensagem do lead).
    expect(result?.summary).toContain("Jundiaí");

    findLead360Spy.mockRestore();
    assumeControlSpy.mockRestore();
    addActivitySpy.mockRestore();
    querySpy.mockRestore();
  });

  it("should return null when lead does not exist for this tenant", async () => {
    const findLead360Spy = vi.spyOn(mockLeadRepo, "findLead360").mockResolvedValue(null);
    const assumeControlSpy = vi.spyOn(mockLeadRepo, "assumeControl");

    const result = await gateway.assumeConversation(tenantCtx, "missing-lead");

    expect(result).toBeNull();
    expect(assumeControlSpy).not.toHaveBeenCalled();

    findLead360Spy.mockRestore();
    assumeControlSpy.mockRestore();
  });
});
