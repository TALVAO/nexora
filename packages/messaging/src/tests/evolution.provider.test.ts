import { describe, it, expect } from "vitest";
import {
  EvolutionWhatsAppProvider,
  type EvolutionWebhookPayload,
} from "../providers/evolution.provider.js";

describe("EvolutionWhatsAppProvider", () => {
  const provider = new EvolutionWhatsAppProvider("test-secret-key");

  it("should validate webhook apiKey correctly", () => {
    expect(provider.validateWebhook("test-secret-key")).toBe(true);
    expect(provider.validateWebhook("wrong-key")).toBe(false);
  });

  it("should normalize text message from Evolution payload", () => {
    const payload: EvolutionWebhookPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "5511999887766@s.whatsapp.net",
          fromMe: false,
          id: "EVO_MSG_12345",
        },
        pushName: "João Imóveis",
        message: {
          conversation: "Olá, tenho interesse no apartamento do centro",
        },
        messageTimestamp: 1723650000,
      },
    };

    const normalized = provider.normalizeInbound(payload, "tenant-1");

    expect(normalized.channel).toBe("WHATSAPP");
    expect(normalized.provider).toBe("evolution");
    expect(normalized.externalMessageId).toBe("EVO_MSG_12345");
    expect(normalized.externalUserId).toBe("5511999887766");
    expect(normalized.direction).toBe("INBOUND");
    expect(normalized.type).toBe("TEXT");
    expect(normalized.text).toBe("Olá, tenho interesse no apartamento do centro");
    expect(normalized.tenantId).toBe("tenant-1");
  });

  it("should normalize image message with caption", () => {
    const payload: EvolutionWebhookPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: "5511999887766@s.whatsapp.net",
          fromMe: false,
          id: "EVO_IMG_99",
        },
        message: {
          imageMessage: {
            caption: "Segue o comprovante",
            url: "https://example.com/image.jpg",
          },
        },
      },
    };

    const normalized = provider.normalizeInbound(payload, "tenant-1");
    expect(normalized.type).toBe("IMAGE");
    expect(normalized.text).toBe("Segue o comprovante");
    expect(normalized.mediaUrl).toBe("https://example.com/image.jpg");
  });
});
