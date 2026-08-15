import { describe, it, expect } from "vitest";
import {
  InstagramMessagingProvider,
  type InstagramWebhookPayload,
} from "../providers/instagram.provider.js";

describe("InstagramMessagingProvider (Etapa 9)", () => {
  const provider = new InstagramMessagingProvider({
    verifyToken: "secret-ig-token",
    accessToken: "mock-access-token",
  });

  describe("Webhook Token Verification", () => {
    it("should accept valid verify token", () => {
      expect(provider.verifyWebhookToken("secret-ig-token")).toBe(true);
    });

    it("should reject invalid verify token", () => {
      expect(provider.verifyWebhookToken("wrong-token")).toBe(false);
    });
  });

  describe("Inbound Direct Messages Normalization", () => {
    it("should normalize a simple direct text message", () => {
      const payload: InstagramWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "page-123",
            time: 1718000000000,
            messaging: [
              {
                sender: { id: "ig-user-777" },
                recipient: { id: "page-123" },
                timestamp: 1718000000000,
                message: {
                  mid: "m_ig_mid_123",
                  text: "Olá! Vi um imóvel no seu perfil e gostaria de saber o valor do aluguel.",
                },
              },
            ],
          },
        ],
      };

      const normalized = provider.normalizeInbound(payload, "tenant-test");

      expect(normalized.channel).toBe("INSTAGRAM");
      expect(normalized.provider).toBe("instagram_graph");
      expect(normalized.externalUserId).toBe("ig-user-777");
      expect(normalized.externalMessageId).toBe("m_ig_mid_123");
      expect(normalized.type).toBe("TEXT");
      expect(normalized.text).toBe(
        "Olá! Vi um imóvel no seu perfil e gostaria de saber o valor do aluguel.",
      );
    });

    it("should normalize a story reply message", () => {
      const payload: InstagramWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "page-123",
            time: 1718000000000,
            messaging: [
              {
                sender: { id: "ig-user-888" },
                recipient: { id: "page-123" },
                timestamp: 1718000000000,
                message: {
                  mid: "m_story_reply_456",
                  text: "Ainda está disponível?",
                  reply_to: {
                    story: {
                      id: "story-999",
                      url: "https://instagram.com/stories/story-999.jpg",
                    },
                  },
                },
              },
            ],
          },
        ],
      };

      const normalized = provider.normalizeInbound(payload, "tenant-test");

      expect(normalized.channel).toBe("INSTAGRAM");
      expect(normalized.text).toContain("[Resposta ao Story]");
      expect(normalized.text).toContain("Ainda está disponível?");
      expect(normalized.mediaUrl).toBe("https://instagram.com/stories/story-999.jpg");
    });

    it("should normalize an image attachment / story mention", () => {
      const payload: InstagramWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "page-123",
            time: 1718000000000,
            messaging: [
              {
                sender: { id: "ig-user-999" },
                recipient: { id: "page-123" },
                timestamp: 1718000000000,
                message: {
                  mid: "m_att_789",
                  attachments: [
                    {
                      type: "image",
                      payload: { url: "https://lookaside.fbsbx.com/ig_media/123.jpg" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const normalized = provider.normalizeInbound(payload, "tenant-test");

      expect(normalized.type).toBe("IMAGE");
      expect(normalized.mediaUrl).toBe("https://lookaside.fbsbx.com/ig_media/123.jpg");
    });
  });

  describe("Delivery and Read Status Callbacks", () => {
    it("should parse read status", () => {
      const payload: InstagramWebhookPayload = {
        object: "instagram",
        entry: [
          {
            messaging: [
              {
                sender: { id: "ig-user-777" },
                read: { watermark: 1718000000000 },
              },
            ],
          },
        ],
      };

      const status = provider.getDeliveryStatus(payload);
      expect(status.status).toBe("READ");
    });

    it("should parse delivery status", () => {
      const payload: InstagramWebhookPayload = {
        object: "instagram",
        entry: [
          {
            messaging: [
              {
                sender: { id: "ig-user-777" },
                delivery: { mids: ["m_ig_mid_123"], watermark: 1718000000000 },
              },
            ],
          },
        ],
      };

      const status = provider.getDeliveryStatus(payload);
      expect(status.status).toBe("DELIVERED");
      expect(status.externalMessageId).toBe("m_ig_mid_123");
    });
  });

  describe("Outbound Sending", () => {
    it("should format and handle outbound simulated sending", async () => {
      const simProvider = new InstagramMessagingProvider({ verifyToken: "token" });
      const res = await simProvider.sendText({
        tenantId: "tenant-1",
        to: "ig-user-777",
        text: "Olá! Seguem as informações do apartamento.",
      });

      expect(res.success).toBe(true);
      expect(res.externalMessageId).toBeDefined();
    });
  });
});
