import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { LeadRepository, VisitRepository, type Lead360View, type VisitRow } from "@nexora/database";
import { CRMSyncService } from "@nexora/crm";

describe("CRM API Routes Integration (Etapa 10)", () => {
  let app: FastifyInstance;
  let leadRepo: LeadRepository;
  let visitRepo: VisitRepository;
  let crmService: CRMSyncService;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testLeadId = "lead-crm-api-01";
  const testVisitId = "visit-crm-api-01";

  const mockLead360: Lead360View = {
    lead: {
      id: testLeadId,
      tenant_id: testTenantId,
      assigned_user_id: null,
      name: "Mariana Costa",
      phone: "5511988882222",
      instagram_user_id: null,
      email: "mariana@example.com",
      source: "WHATSAPP",
      intent: "RENTAL_SEARCH",
      stage: "QUALIFIED",
      temperature: "HOT",
      score: 90,
      automation_mode: "AI",
      first_contact_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
      last_outbound_at: null,
      next_action_at: null,
      lost_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    profile: {
      transaction_type: "RENT",
      property_type: "Apartamento",
      city: "Jundiaí",
      neighborhoods: ["Eloy Chaves"],
      max_budget: 3500,
      bedrooms: 2,
    },
    stageHistory: [],
    activities: [],
    recentMessages: [],
  };

  const mockVisit: VisitRow = {
    id: testVisitId,
    tenant_id: testTenantId,
    lead_id: testLeadId,
    property_id: "prop-123",
    assigned_user_id: null,
    scheduled_at: new Date().toISOString(),
    status: "SCHEDULED",
    feedback: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    leadRepo = new LeadRepository();
    visitRepo = new VisitRepository();
    crmService = new CRMSyncService();

    app = await buildApp({
      leadRepo,
      visitRepo,
      crmService,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/crm/config", () => {
    it("should return tenant CRM config", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/crm/config",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.config.mode).toBe("NO_SYNC");
    });
  });

  describe("POST /api/crm/config", () => {
    it("should update CRM config to API mode", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/crm/config",
        headers: { "x-tenant-id": testTenantId },
        payload: {
          mode: "API",
          isEnabled: true,
          apiUrl: "https://api.crm.com",
          apiKey: "crm-token-123",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.config.mode).toBe("API");
      expect(body.config.apiKey).toBe("crm-token-123");
    });
  });

  describe("POST /api/crm/sync/lead/:id", () => {
    it("should sync qualified lead with external CRM", async () => {
      leadRepo.findLead360 = async () => mockLead360;
      leadRepo.addActivity = async () => ({ id: "act-sync-1" });
      crmService.syncQualifiedLead = async () => ({
        success: true,
        mode: "API",
        externalCrmId: "ext-lead-999",
        syncedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/crm/sync/lead/${testLeadId}`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.result.externalCrmId).toBe("ext-lead-999");
    });
  });

  describe("POST /api/crm/sync/visit/:id", () => {
    it("should sync visit with external CRM", async () => {
      visitRepo.findById = async () => mockVisit;
      crmService.syncVisit = async () => ({
        success: true,
        mode: "API",
        externalCrmId: "ext-visit-888",
        syncedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/crm/sync/visit/${testVisitId}`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.result.externalCrmId).toBe("ext-visit-888");
    });
  });

  describe("GET /api/crm/export/csv", () => {
    it("should generate CSV export of leads", async () => {
      leadRepo.listWithFilters = async () => ({ leads: [mockLead360.lead], total: 1 });

      const response = await app.inject({
        method: "GET",
        url: "/api/crm/export/csv",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.payload).toContain("lead_id,name,phone");
      expect(response.payload).toContain("Mariana Costa");
    });
  });
});
