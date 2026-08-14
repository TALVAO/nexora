import { describe, it, expect } from "vitest";
import {
  InstagramMessagingProvider,
  type InstagramWebhookPayload,
} from "../providers/instagram.provider.js";

describe("InstagramMessagingProvider", () => {
  const provider = new InstagramMessagingProvider("nexora-ig-token");

  it("should verify webhook token", () => {
    expect(provider.verifyWebhookToken("nexora-ig-token")).toBe(true);
    expect(provider.verifyWebhookToken("other")).toBe(false);
  });

  it("should normalize Instagram inbound message", () => {
    const payload: InstagramWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: "IG_PAGE_ID",
          time: 1723652000,
          messaging: [
            {
              sender: { id: "ig_user_456" },
              recipient: { id: "IG_PAGE_ID" },
              timestamp: 1723652000000,
              message: {
                mid: "m_mid.12345:67890",
                text: "Vi o story da casa no condomínio, ainda está disponível?",
              },
            },
          ],
        },
      ],
    };

    const normalized = provider.normalizeInbound(payload, "tenant-3");

    expect(normalized.channel).toBe("INSTAGRAM");
    expect(normalized.provider).toBe("instagram_graph");
    expect(normalized.externalUserId).toBe("ig_user_456");
    expect(normalized.externalMessageId).toBe("m_mid.12345:67890");
    expect(normalized.text).toBe("Vi o story da casa no condomínio, ainda está disponível?");
    expect(normalized.tenantId).toBe("tenant-3");
  });
});
