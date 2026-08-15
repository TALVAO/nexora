import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { PilotRepository } from "@nexora/database";

describe("Pilot API Routes Integration (Etapa 11)", () => {
  let app: FastifyInstance;
  let pilotRepo: PilotRepository;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    pilotRepo = new PilotRepository();
    app = await buildApp({ pilotRepo });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/pilot/metrics", () => {
    it("should return daily operational metrics for the pilot", async () => {
      pilotRepo.getDailyMetrics = async () => ({
        tenantId: testTenantId,
        period: {
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-15T00:00:00.000Z",
        },
        aiRunsCount: 50,
        aiErrorsCount: 0,
        unansweredQuestionsCount: 1,
        lostLeadsCount: 2,
        lostReasons: { "Orçamento insuficiente": 2 },
        handoffsCount: 4,
        followupsSentCount: 20,
        followupsCancelledCount: 15,
        visitsScheduledCount: 10,
        visitsCompletedCount: 8,
        estimatedSavedMinutes: 360,
        activeLeadsCount: 18,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/pilot/metrics",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.metrics.aiRunsCount).toBe(50);
      expect(body.metrics.estimatedSavedMinutes).toBe(360);
    });
  });

  describe("POST /api/pilot/incidents", () => {
    it("should record an incident reported during pilot", async () => {
      pilotRepo.recordIncident = async () => ({
        id: "inc-100",
        recordedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/pilot/incidents",
        headers: { "x-tenant-id": testTenantId },
        payload: {
          incidentType: "UNANSWERED_QUESTION",
          description: "Cliente perguntou se aceita fiador de outro estado",
          severity: "MEDIUM",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.incidentId).toBe("inc-100");
    });
  });

  describe("GET /api/pilot/incidents", () => {
    it("should list pilot incidents", async () => {
      pilotRepo.listIncidents = async () => [
        {
          id: "inc-100",
          tenant_id: testTenantId,
          lead_id: null,
          incident_type: "UNANSWERED_QUESTION",
          description: "Cliente perguntou sobre fiador",
          expected_behavior: null,
          actual_behavior: null,
          severity: "MEDIUM",
          created_at: new Date().toISOString(),
        },
      ];

      const response = await app.inject({
        method: "GET",
        url: "/api/pilot/incidents",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.incidents.length).toBe(1);
      expect(body.incidents[0].incident_type).toBe("UNANSWERED_QUESTION");
    });
  });
});
