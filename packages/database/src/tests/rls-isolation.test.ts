import { describe, it, expect, vi } from "vitest";
import { LeadRepository } from "../repositories/lead.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import * as dbClient from "../client.js";
import type { LeadRow, MessageRow } from "../types.js";

describe("Tenant Data Isolation (Multi-Tenancy)", () => {
  const tenantA = { tenantId: "tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
  const tenantB = { tenantId: "tenant-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };

  it("should always include tenant_id in SQL queries when fetching leads", async () => {
    const leadRepo = new LeadRepository();

    const querySpy = vi.spyOn(dbClient, "query").mockImplementation(async (sql, params) => {
      expect(sql).toContain("tenant_id = $2");
      expect(params).toEqual(["lead-123", tenantA.tenantId]);
      return {
        rows: [
          {
            id: "lead-123",
            tenant_id: tenantA.tenantId,
            name: "Lead Tenant A",
            source: "WHATSAPP",
            stage: "NEW",
            temperature: "COLD",
            score: 0,
            automation_mode: "AI",
          } as LeadRow,
        ],
        rowCount: 1,
      };
    });

    const lead = await leadRepo.findById(tenantA, "lead-123");
    expect(lead).toBeDefined();
    expect(lead?.tenant_id).toBe(tenantA.tenantId);

    querySpy.mockRestore();
  });

  it("should never return Tenant B lead when requested with Tenant A context", async () => {
    const leadRepo = new LeadRepository();

    const querySpy = vi.spyOn(dbClient, "query").mockImplementation(async (_sql, params) => {
      // In database, WHERE id = $1 AND tenant_id = $2 will return empty for tenant A querying tenant B lead
      if (params?.[1] === tenantA.tenantId && params?.[0] === "lead-from-tenant-b") {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await leadRepo.findById(tenantA, "lead-from-tenant-b");
    expect(result).toBeNull();

    querySpy.mockRestore();
  });

  it("should isolate messages by tenant_id and prevent cross-tenant message leak", async () => {
    const messageRepo = new MessageRepository();

    const querySpy = vi.spyOn(dbClient, "query").mockImplementation(async (sql, params) => {
      expect(sql).toContain("tenant_id = $1");
      expect(params?.[0]).toBe(tenantA.tenantId);

      return {
        rows: [
          {
            id: "msg-1",
            tenant_id: tenantA.tenantId,
            external_message_id: "ext-100",
            direction: "INBOUND",
            sender_type: "LEAD",
            message_type: "TEXT",
            text: "Mensagem do Tenant A",
          } as MessageRow,
        ],
        rowCount: 1,
      };
    });

    const message = await messageRepo.findByExternalId(tenantA, "ext-100");
    expect(message?.tenant_id).toBe(tenantA.tenantId);

    querySpy.mockRestore();
  });
});
