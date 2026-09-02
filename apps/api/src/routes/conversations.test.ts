import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo } from "../test-utils/auth.js";
import { MessageGateway, EvolutionWhatsAppProvider } from "@nexora/messaging";
import { MessageRepository, type MessageRow } from "@nexora/database";

describe("Conversations and WhatsApp Outbound API Integration", () => {
  let app: FastifyInstance;
  let gateway: MessageGateway;
  let messageRepo: MessageRepository;
  let evolutionProvider: EvolutionWhatsAppProvider;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testConversationId = "conv-out-001";

  beforeAll(async () => {
    gateway = new MessageGateway();
    messageRepo = new MessageRepository();
    evolutionProvider = new EvolutionWhatsAppProvider();

    app = await buildApp({
      gateway,
      messageRepo,
      evolutionProvider,
      tenantRepo: createAuthTestTenantRepo(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/conversations/:id/messages (Outbound WhatsApp Sending)", () => {
    it("should successfully send text message to conversation and return message row", async () => {
      const fakeCreatedMsg: MessageRow = {
        id: "msg-out-100",
        tenant_id: testTenantId,
        conversation_id: testConversationId,
        lead_id: "lead-out-001",
        external_message_id: "evo_out_9999",
        direction: "OUTBOUND",
        sender_type: "USER",
        message_type: "TEXT",
        text: "Olá, recebemos sua mensagem. Vamos verificar o imóvel para você!",
        media_url: null,
        provider_status: "SENT",
        ai_generated: false,
        ai_run_id: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      gateway.sendOutbound = async () => ({
        success: true,
        message: fakeCreatedMsg,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/conversations/${testConversationId}/messages`,
        headers: authHeaders(app),
        payload: {
          text: "Olá, recebemos sua mensagem. Vamos verificar o imóvel para você!",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.message.id).toBe("msg-out-100");
      expect(body.message.direction).toBe("OUTBOUND");
      expect(body.message.provider_status).toBe("SENT");
    });

    it("should send media message (image/document) with caption", async () => {
      const fakeMediaMsg: MessageRow = {
        id: "msg-out-101",
        tenant_id: testTenantId,
        conversation_id: testConversationId,
        lead_id: "lead-out-001",
        external_message_id: "evo_media_888",
        direction: "OUTBOUND",
        sender_type: "USER",
        message_type: "IMAGE",
        text: "Foto da fachada do imóvel",
        media_url: "https://example.com/fachada.jpg",
        provider_status: "SENT",
        ai_generated: false,
        ai_run_id: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      gateway.sendOutbound = async () => ({
        success: true,
        message: fakeMediaMsg,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/conversations/${testConversationId}/messages`,
        headers: authHeaders(app),
        payload: {
          mediaUrl: "https://example.com/fachada.jpg",
          caption: "Foto da fachada do imóvel",
          type: "IMAGE",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.message.message_type).toBe("IMAGE");
      expect(body.message.media_url).toBe("https://example.com/fachada.jpg");
    });

    it("should return 400 Bad Request when neither text nor mediaUrl is provided", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/conversations/${testConversationId}/messages`,
        headers: authHeaders(app),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error).toContain("texto ou URL de mídia");
    });
  });

  describe("GET /api/conversations/:id/messages (History)", () => {
    it("should list messages belonging to the conversation", async () => {
      const fakeMessages: MessageRow[] = [
        {
          id: "msg-1",
          tenant_id: testTenantId,
          conversation_id: testConversationId,
          lead_id: "lead-1",
          external_message_id: "in_1",
          direction: "INBOUND",
          sender_type: "LEAD",
          message_type: "TEXT",
          text: "Gostaria de ver o apartamento",
          media_url: null,
          provider_status: "DELIVERED",
          ai_generated: false,
          ai_run_id: null,
          sent_at: new Date().toISOString(),
          delivered_at: null,
          read_at: null,
          created_at: new Date().toISOString(),
        },
      ];

      messageRepo.listByConversation = async () => fakeMessages;

      const response = await app.inject({
        method: "GET",
        url: `/api/conversations/${testConversationId}/messages`,
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages.length).toBe(1);
      expect(body.messages[0].text).toBe("Gostaria de ver o apartamento");
    });
  });

  describe("GET /api/channels/status (Channel Connectivity)", () => {
    it("should return status of WhatsApp Evolution channel", async () => {
      evolutionProvider.getConnectionStatus = async () => ({
        connected: true,
        state: "open",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/channels/status",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.channels.whatsapp).toBeDefined();
      expect(body.channels.whatsapp.provider).toBe("evolution");
      expect(body.channels.whatsapp.connected).toBe(true);
    });
  });
});
