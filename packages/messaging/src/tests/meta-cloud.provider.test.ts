import { describe, it, expect } from "vitest";
import {
  MetaWhatsAppCloudProvider,
  type MetaWebhookPayload,
} from "../providers/meta-cloud.provider.js";

describe("MetaWhatsAppCloudProvider", () => {
  const provider = new MetaWhatsAppCloudProvider("nexora-meta-token");

  it("should verify webhook challenge token correctly", () => {
    expect(provider.verifyWebhookToken("nexora-meta-token")).toBe(true);
    expect(provider.verifyWebhookToken("invalid-token")).toBe(false);
  });

  it("should normalize inbound text message from Meta Cloud payload", () => {
    const payload: MetaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "551133334444",
                  phone_number_id: "PHONE_ID_1",
                },
                contacts: [{ profile: { name: "Maria" }, wa_id: "5511988887777" }],
                messages: [
                  {
                    from: "5511988887777",
                    id: "wamid.HBgLMTE5ODg4ODc3Nzc=",
                    timestamp: "1723651200",
                    type: "text",
                    text: { body: "Gostaria de agendar uma visita amanhã" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const normalized = provider.normalizeInbound(payload, "tenant-2");

    expect(normalized.channel).toBe("WHATSAPP");
    expect(normalized.provider).toBe("meta_cloud");
    expect(normalized.externalMessageId).toBe("wamid.HBgLMTE5ODg4ODc3Nzc=");
    expect(normalized.externalUserId).toBe("5511988887777");
    expect(normalized.type).toBe("TEXT");
    expect(normalized.text).toBe("Gostaria de agendar uma visita amanhã");
    expect(normalized.tenantId).toBe("tenant-2");
  });
});
