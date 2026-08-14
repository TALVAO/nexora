import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { VisitRepository, LeadRepository, type VisitRow } from "@nexora/database";
import { VisitService } from "@nexora/messaging";

describe("Visits API Routes Integration (Etapa 7)", () => {
  let app: FastifyInstance;
  let visitRepo: VisitRepository;
  let leadRepo: LeadRepository;
  let visitService: VisitService;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testVisitId = "visit-api-001";
  const testLeadId = "lead-visit-api-001";

  const fakeVisit: VisitRow = {
    id: testVisitId,
    tenant_id: testTenantId,
    lead_id: testLeadId,
    property_id: "prop-999",
    assigned_user_id: "broker-111",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    status: "SCHEDULED",
    feedback: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    visitRepo = new VisitRepository();
    leadRepo = new LeadRepository();
    visitService = new VisitService({ visitRepo, leadRepo });
    app = await buildApp({ visitRepo, leadRepo, visitService });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/visits", () => {
    it("should list visits", async () => {
      visitRepo.list = async () => [fakeVisit];

      const response = await app.inject({
        method: "GET",
        url: "/api/visits?status=SCHEDULED",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visits.length).toBe(1);
      expect(body.visits[0].id).toBe(testVisitId);
    });
  });

  describe("GET /api/visits/:id", () => {
    it("should return visit details", async () => {
      visitRepo.findById = async () => fakeVisit;

      const response = await app.inject({
        method: "GET",
        url: `/api/visits/${testVisitId}`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.id).toBe(testVisitId);
    });

    it("should return 404 when visit is not found", async () => {
      visitRepo.findById = async () => null;

      const response = await app.inject({
        method: "GET",
        url: `/api/visits/non-existent`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/visits", () => {
    it("should schedule a new visit", async () => {
      visitService.scheduleVisit = async () => fakeVisit;

      const response = await app.inject({
        method: "POST",
        url: "/api/visits",
        headers: { "x-tenant-id": testTenantId },
        payload: {
          leadId: testLeadId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          propertyId: "prop-999",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.id).toBe(testVisitId);
    });
  });

  describe("POST /api/visits/:id/reschedule", () => {
    it("should reschedule a visit", async () => {
      const newDate = new Date(Date.now() + 172800000).toISOString();
      visitService.rescheduleVisit = async () => ({
        ...fakeVisit,
        scheduled_at: newDate,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/visits/${testVisitId}/reschedule`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          scheduledAt: newDate,
          reason: "Cliente pediu para trocar para domingo",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.scheduled_at).toBe(newDate);
    });
  });

  describe("POST /api/visits/:id/cancel", () => {
    it("should cancel a visit", async () => {
      visitService.cancelVisit = async () => ({
        ...fakeVisit,
        status: "CANCELLED",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/visits/${testVisitId}/cancel`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          reason: "Imóvel já alugado por outro cliente",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.status).toBe("CANCELLED");
    });
  });

  describe("POST /api/visits/:id/complete", () => {
    it("should complete a visit and trigger post_visit follow-up", async () => {
      visitService.completeVisit = async () => ({
        visit: { ...fakeVisit, status: "COMPLETED", feedback: "Adorou o condomínio" },
        followupJobScheduled: true,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/visits/${testVisitId}/complete`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          feedback: "Adorou o condomínio",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.status).toBe("COMPLETED");
      expect(body.followupJobScheduled).toBe(true);
    });
  });

  describe("POST /api/visits/:id/no-show", () => {
    it("should mark a visit as no-show", async () => {
      visitService.markNoShow = async () => ({
        ...fakeVisit,
        status: "NO_SHOW",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/visits/${testVisitId}/no-show`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          reason: "Lead não atendeu celular no horário",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.status).toBe("NO_SHOW");
    });
  });

  describe("POST /api/visits/:id/feedback", () => {
    it("should record feedback for a visit", async () => {
      visitService.recordFeedback = async () => ({
        ...fakeVisit,
        feedback: "Cliente achou o valor do condomínio alto",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/visits/${testVisitId}/feedback`,
        headers: { "x-tenant-id": testTenantId },
        payload: {
          feedback: "Cliente achou o valor do condomínio alto",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.visit.feedback).toContain("condomínio");
    });
  });
});
