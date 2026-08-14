import { describe, it, expect, vi } from "vitest";
import { MessageRepository } from "../repositories/message.repository.js";
import * as dbClient from "../client.js";
import type { MessageRow } from "../types.js";

describe("Message Idempotency Engine", () => {
  const tenantCtx = { tenantId: "tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };

  it("should detect duplicate message and return isDuplicate = true without creating duplicate row", async () => {
    const messageRepo = new MessageRepository();

    const existingMessage: MessageRow = {
      id: "msg-001",
      tenant_id: tenantCtx.tenantId,
      conversation_id: "conv-001",
      lead_id: "lead-001",
      external_message_id: "ext-msg-12345",
      direction: "INBOUND",
      sender_type: "LEAD",
      message_type: "TEXT",
      text: "Olá!",
      media_url: null,
      provider_status: "DELIVERED",
      ai_generated: false,
      ai_run_id: null,
      sent_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    const querySpy = vi.spyOn(dbClient, "query").mockResolvedValue({
      rows: [existingMessage],
      rowCount: 1,
    });

    const result = await messageRepo.create(tenantCtx, {
      conversation_id: "conv-001",
      lead_id: "lead-001",
      external_message_id: "ext-msg-12345",
      direction: "INBOUND",
      sender_type: "LEAD",
      message_type: "TEXT",
      text: "Olá!",
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.message.id).toBe("msg-001");
    expect(result.message.external_message_id).toBe("ext-msg-12345");

    querySpy.mockRestore();
  });
});
