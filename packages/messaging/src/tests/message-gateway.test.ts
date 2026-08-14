import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageGateway } from "../gateway/message-gateway.js";
import {
  LeadRepository,
  MessageRepository,
  FollowupRepository,
  type LeadRow,
  type ConversationRow,
  type MessageRow,
} from "@nexora/database";
import * as dbClient from "@nexora/database";

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
