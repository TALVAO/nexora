import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { LeadRepository, type LeadRow, type Lead360View } from "@nexora/database";

describe("CRM Leads API Integration (Etapa 5)", () => {
  let app: FastifyInstance;
  let leadRepo: LeadRepository;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testLeadId = "lead-test-555";

  const fakeLead: LeadRow = {
    id: testLeadId,
    tenant_id: testTenantId,
    assigned_user_id: null,
    name: "Carlos Eduardo",
    phone: "5511999887766",
    instagram_user_id: null,
    email: "carlos@example.com",
    source: "WHATSAPP",
    intent: "RENTAL_SEARCH",
    stage: "QUALIFYING",
    temperature: "WARM",
    score: 65,
    automation_mode: "AI",
    first_contact_at: new Date().toISOString(),
    last_inbound_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
    next_action_at: null,
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    leadRepo = new LeadRepository();
    app = await buildApp({ leadRepo });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/leads (List with Filters)", () => {
    it("should list leads with filters applied", async () => {
      leadRepo.listWithFilters = async () => ({
        leads: [fakeLead],
        total: 1,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/leads?stage=QUALIFYING&temperature=WARM&automation_mode=AI",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.leads.length).toBe(1);
      expect(body.leads[0].name).toBe("Carlos Eduardo");
      expect(body.total).toBe(1);
    });
  });

  describe("GET /api/leads/:id (Lead 360 View)", () => {
    it("should return complete Lead 360 data", async () => {
      const fake360: Lead360View = {
        lead: fakeLead,
        profile: {
          transaction_type: "RENT",
          property_type: "Apartamento",
          city: "Jundiaí",
          neighborhoods: ["Eloy Chaves"],
          max_budget: 3500,
          bedrooms: 2,
          parking_spaces: 1,
          pet_required: true,
          rental_guarantee: "Caução",
        },
        stageHistory: [
          {
            id: "hist-1",
            from_stage: "NEW",
            to_stage: "QUALIFYING",
            reason: "Lead informou critérios",
            created_at: new Date().toISOString(),
          },
        ],
        activities: [
          {
            id: "act-1",
            activity_type: "NOTE",
            description: "Cliente prefere condomínio com piscina",
            created_at: new Date().toISOString(),
          },
        ],
        recentMessages: [],
      };

      leadRepo.findLead360 = async () => fake360;

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.lead.id).toBe(testLeadId);
      expect(body.data.profile.neighborhoods).toContain("Eloy Chaves");
      expect(body.data.stageHistory.length).toBe(1);
      expect(body.data.activities.length).toBe(1);
    });

    it("should return 404 if lead is not found", async () => {
      leadRepo.findLead360 = async () => null;

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/non-existent`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe("PATCH /api/leads/:id (Human Takeover & Updates)", () => {
    it("should update automation_mode from AI to HUMAN", async () => {
      leadRepo.update = async () => ({
        ...fakeLead,
        automation_mode: "HUMAN",
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/leads/${testLeadId}`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          automation_mode: "HUMAN",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.lead.automation_mode).toBe("HUMAN");
    });
  });

  describe("PUT /api/leads/:id/profile (Update Real Estate Preferences)", () => {
    it("should update structured lead profile", async () => {
      const updatedProfile = {
        transaction_type: "BUY",
        max_budget: 800000,
        bedrooms: 3,
      };

      leadRepo.upsertProfile = async () => updatedProfile;

      const response = await app.inject({
        method: "PUT",
        url: `/api/leads/${testLeadId}/profile`,
        headers: { "x-tenant-id": testTenantId },
        payload: updatedProfile,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.profile.transaction_type).toBe("BUY");
      expect(body.profile.max_budget).toBe(800000);
    });
  });

  describe("POST /api/leads/:id/activities (Add Note)", () => {
    it("should add note/activity to lead", async () => {
      leadRepo.addActivity = async () => ({ id: "act-new-99" });

      const response = await app.inject({
        method: "POST",
        url: `/api/leads/${testLeadId}/activities`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          activity_type: "NOTE",
          description: "Cliente ligou confirmando interesse em visitar sábado às 14h.",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.activityId).toBe("act-new-99");
    });
  });

  describe("POST /api/leads/:id/link-identity (Link Instagram or Phone)", () => {
    it("should link phone to an existing lead", async () => {
      leadRepo.linkIdentity = async () => ({
        ...fakeLead,
        phone: "5511988887777",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/leads/${testLeadId}/link-identity`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          phone: "5511988887777",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.lead.phone).toBe("5511988887777");
    });
  });

  describe("POST /api/leads/:id/merge (Merge Cross-channel Leads)", () => {
    it("should merge source lead into target lead", async () => {
      leadRepo.mergeLeads = async () => ({
        ...fakeLead,
        phone: "5511988887777",
        instagram_user_id: "instagram_lead_user",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/leads/${testLeadId}/merge`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          sourceLeadId: "lead-source-999",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.lead.instagram_user_id).toBe("instagram_lead_user");
    });
  });
});
