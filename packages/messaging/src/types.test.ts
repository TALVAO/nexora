import { describe, it, expect } from "vitest";
import type { NormalizedMessage } from "./types.js";

describe("@nexora/messaging", () => {
  it("should define valid NormalizedMessage structure", () => {
    const message: NormalizedMessage = {
      tenantId: "tenant-1",
      provider: "evolution",
      channel: "WHATSAPP",
      externalMessageId: "msg_123456",
      externalUserId: "5511999999999",
      direction: "INBOUND",
      type: "TEXT",
      text: "Olá, gostaria de alugar um apartamento",
      timestamp: new Date().toISOString(),
    };

    expect(message.channel).toBe("WHATSAPP");
    expect(message.direction).toBe("INBOUND");
    expect(message.type).toBe("TEXT");
  });
});
