import { describe, it, expect, vi } from "vitest";
import { CRMSyncService } from "./crm-sync-service.js";
import { NoSyncAdapter } from "./adapters/no-sync.adapter.js";
import { CsvExportAdapter } from "./adapters/csv-export.adapter.js";
import { WebhookCRMAdapter } from "./adapters/webhook.adapter.js";
import { GenericApiCRMAdapter } from "./adapters/api.adapter.js";
import type { CRMLeadSyncInput, CRMVisitSyncInput, CRMActivitySyncInput } from "./types.js";

describe("CRM Adapters & Sync Engine (Etapa 10)", () => {
  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  const sampleLeadInput: CRMLeadSyncInput = {
    leadId: "lead-crm-101",
    name: "Mariana Costa",
    phone: "5511988882222",
    email: "mariana@example.com",
    stage: "QUALIFIED",
    score: 90,
    temperature: "HOT",
    profile: {
      transactionType: "RENT",
      propertyType: "Apartamento",
      city: "Jundiaí",
      neighborhoods: ["Eloy Chaves"],
      maxBudget: 3500,
      bedrooms: 2,
    },
  };

  const sampleVisitInput: CRMVisitSyncInput = {
    visitId: "visit-crm-501",
    leadId: "lead-crm-101",
    propertyId: "prop-999",
    scheduledAt: new Date().toISOString(),
    status: "SCHEDULED",
  };

  const sampleActivityInput: CRMActivitySyncInput = {
    leadId: "lead-crm-101",
    activityType: "NOTE",
    description: "Cliente tem pressa para locação.",
  };

  describe("NoSyncAdapter", () => {
    const adapter = new NoSyncAdapter();

    it("should return success without making external calls", async () => {
      const res = await adapter.upsertLead(testTenantId, sampleLeadInput);
      expect(res.success).toBe(true);
      expect(res.mode).toBe("NO_SYNC");
    });
  });

  describe("CsvExportAdapter", () => {
    const adapter = new CsvExportAdapter();

    it("should format lead data into valid CSV", async () => {
      const res = await adapter.upsertLead(testTenantId, sampleLeadInput);
      expect(res.success).toBe(true);
      expect(res.mode).toBe("CSV_EXPORT");
      expect(res.exportData).toContain("Mariana Costa");
      expect(res.exportData).toContain("Eloy Chaves");
    });

    it("should format activity and visit into CSV format", async () => {
      const visitRes = await adapter.createVisit(testTenantId, sampleVisitInput);
      expect(visitRes.exportData).toContain("visit-crm-501");

      const actRes = await adapter.createActivity(testTenantId, sampleActivityInput);
      expect(actRes.exportData).toContain("Cliente tem pressa");
    });
  });

  describe("WebhookCRMAdapter", () => {
    it("should execute webhook dispatch", async () => {
      const adapter = new WebhookCRMAdapter("https://crm-externo.com/webhook");

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "received" }),
      } as Response);

      const res = await adapter.upsertLead(testTenantId, sampleLeadInput);
      expect(res.success).toBe(true);
      expect(res.mode).toBe("WEBHOOK");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://crm-externo.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Nexora-Event": "lead.qualified",
          }),
        }),
      );
    });
  });

  describe("GenericApiCRMAdapter", () => {
    it("should execute REST API call with Bearer authentication and retry", async () => {
      const adapter = new GenericApiCRMAdapter({
        apiUrl: "https://api.crm-legado.com/v1",
        apiKey: "test-api-key",
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "crm_lead_888" }),
      } as Response);

      const res = await adapter.upsertLead(testTenantId, sampleLeadInput);
      expect(res.success).toBe(true);
      expect(res.externalCrmId).toBe("crm_lead_888");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.crm-legado.com/v1/leads",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });
  });

  describe("CRMSyncService Orchestration", () => {
    it("should switch adapters dynamically based on tenant configuration", async () => {
      const service = new CRMSyncService();

      // Default is NO_SYNC
      expect(service.getConfig(testTenantId).mode).toBe("NO_SYNC");

      // Configure WEBHOOK mode
      service.setConfig({
        tenantId: testTenantId,
        mode: "WEBHOOK",
        isEnabled: true,
        webhookUrl: "https://n8n.webhook.site/crm",
      });

      expect(service.getConfig(testTenantId).mode).toBe("WEBHOOK");
      expect(service.getAdapter(testTenantId).mode).toBe("WEBHOOK");

      // Configure API mode
      service.setConfig({
        tenantId: testTenantId,
        mode: "API",
        isEnabled: true,
        apiUrl: "https://api.crm.com",
        apiKey: "key-123",
      });

      expect(service.getConfig(testTenantId).mode).toBe("API");
      expect(service.getAdapter(testTenantId).mode).toBe("API");
    });
  });
});
