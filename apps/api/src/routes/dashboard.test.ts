import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo } from "../test-utils/auth.js";
import { LeadRepository, type DashboardMetrics } from "@nexora/database";

describe("Dashboard CRM Metrics API Integration (Etapa 5)", () => {
  let app: FastifyInstance;
  let leadRepo: LeadRepository;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    leadRepo = new LeadRepository();
    app = await buildApp({ leadRepo, tenantRepo: createAuthTestTenantRepo() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/dashboard/metrics should return aggregated commercial funnel metrics", async () => {
    const fakeMetrics: DashboardMetrics = {
      totalLeads: 42,
      leadsByStage: {
        NEW: 10,
        CONTACTED: 5,
        QUALIFYING: 12,
        QUALIFIED: 8,
        VISIT_SCHEDULED: 3,
        VISITED: 2,
        PROPOSAL: 1,
        WON: 1,
        LOST: 0,
        DORMANT: 0,
      },
      leadsByTemperature: {
        HOT: 14,
        WARM: 20,
        COLD: 8,
      },
      leadsByAutomation: {
        AI: 35,
        HUMAN: 7,
      },
      activeConversations: 18,
      scheduledVisits: 3,
    };

    leadRepo.getDashboardMetrics = async () => fakeMetrics;

    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard/metrics",
      headers: authHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.metrics.totalLeads).toBe(42);
    expect(body.metrics.leadsByStage.NEW).toBe(10);
    expect(body.metrics.leadsByTemperature.HOT).toBe(14);
    expect(body.metrics.leadsByAutomation.AI).toBe(35);
    expect(body.metrics.activeConversations).toBe(18);
  });
});
