import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MessageGateway } from "@nexora/messaging";
import type { LeadRow, ConversationRow, MessageRow } from "@nexora/database";

describe("Webhook Routes API Integration", () => {
  let app: FastifyInstance;
  let gateway: MessageGateway;
  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = "test-webhook-secret-token";

    gateway = new MessageGateway();

    app = await buildApp({ gateway });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /webhooks/whatsapp/:provider (Meta Cloud Webhook Verification)", () => {
    it("should respond with challenge when verify_token matches", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/webhooks/whatsapp/meta_cloud?hub.mode=subscribe&hub.verify_token=test-webhook-secret-token&hub.challenge=1158201444",
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toBe("1158201444");
    });

    it("should return 403 Forbidden when verify_token is invalid", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/webhooks/whatsapp/meta_cloud?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=1158201444",
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("POST /webhooks/whatsapp/evolution (Inbound WhatsApp Pipeline)", () => {
    const fakeLead: LeadRow = {
      id: "lead-wh-001",
      tenant_id: testTenantId,
      assigned_user_id: null,
      name: "Cliente WhatsApp",
      phone: "5511999991111",
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
      id: "conv-wh-001",
      tenant_id: testTenantId,
      lead_id: fakeLead.id,
      channel: "WHATSAPP",
      provider: "evolution",
      external_conversation_id: "5511999991111@s.whatsapp.net",
      status: "OPEN",
      assigned_user_id: null,
      automation_mode: "AI",
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const fakeMessage: MessageRow = {
      id: "msg-wh-001",
      tenant_id: testTenantId,
      conversation_id: fakeConversation.id,
      lead_id: fakeLead.id,
      external_message_id: "evo_msg_first_time",
      direction: "INBOUND",
      sender_type: "LEAD",
      message_type: "TEXT",
      text: "Boa tarde, busco imóvel de 2 quartos",
      media_url: null,
      provider_status: "RECEIVED",
      ai_generated: false,
      ai_run_id: null,
      sent_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    it("should process inbound WhatsApp message and return 200 OK with success", async () => {
      gateway.processInbound = async () => ({
        isDuplicate: false,
        lead: fakeLead,
        conversation: fakeConversation,
        message: fakeMessage,
        automationMode: "AI",
      });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: {
          "x-tenant-id": testTenantId,
        },
        payload: {
          event: "messages.upsert",
          data: {
            key: { id: "evo_msg_first_time", remoteJid: "5511999991111@s.whatsapp.net" },
            message: { conversation: "Boa tarde, busco imóvel de 2 quartos" },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.duplicate).toBe(false);
      expect(body.leadId).toBe("lead-wh-001");
      expect(body.conversationId).toBe("conv-wh-001");
      expect(body.messageId).toBe("msg-wh-001");
      expect(body.automationMode).toBe("AI");
    });

    it("should recognize duplicate webhook and return duplicate = true without failure", async () => {
      gateway.processInbound = async () => ({
        isDuplicate: true,
        lead: fakeLead,
        conversation: fakeConversation,
        message: fakeMessage,
        automationMode: "AI",
      });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: {
          "x-tenant-id": testTenantId,
        },
        payload: {
          event: "messages.upsert",
          data: {
            key: { id: "evo_msg_first_time", remoteJid: "5511999991111@s.whatsapp.net" },
            message: { conversation: "Boa tarde, busco imóvel de 2 quartos" },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.duplicate).toBe(true);
      expect(body.messageId).toBe("msg-wh-001");
    });
  });

  describe("POST /webhooks/instagram/instagram_graph", () => {
    it("should process inbound Instagram message successfully", async () => {
      const fakeLead = { id: "lead-ig-1", automation_mode: "AI" } as LeadRow;
      const fakeConv = { id: "conv-ig-1" } as ConversationRow;
      const fakeMsg = { id: "msg-ig-1" } as MessageRow;

      gateway.processInbound = async () => ({
        isDuplicate: false,
        lead: fakeLead,
        conversation: fakeConv,
        message: fakeMsg,
        automationMode: "AI",
      });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/instagram/instagram_graph",
        headers: { "x-tenant-id": testTenantId },
        payload: {
          object: "instagram",
          entry: [
            {
              messaging: [
                {
                  sender: { id: "ig_user_99" },
                  message: { mid: "m_123", text: "Vi o imóvel no feed" },
                },
              ],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.duplicate).toBe(false);
      expect(body.leadId).toBe("lead-ig-1");
    });
  });
});
