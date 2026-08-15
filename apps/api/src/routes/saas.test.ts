import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { SaasRepository, TenantRepository } from "@nexora/database";
import { PLAN_LIMITS } from "@nexora/shared";

describe("SaaS Commercial API Routes Integration (Etapa 12)", () => {
  let app: FastifyInstance;
  let saasRepo: SaasRepository;
  let tenantRepo: TenantRepository;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testOwnerId = "owner-saas-api-01";

  beforeAll(async () => {
    saasRepo = new SaasRepository();
    tenantRepo = new TenantRepository();
    app = await buildApp({ saasRepo, tenantRepo });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/saas/plans", () => {
    it("should return catalog of commercial plans and limits", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/saas/plans",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.plans.length).toBe(3);
      expect(body.plans[0].id).toBe("INDIVIDUAL");
    });
  });

  describe("POST /api/saas/onboarding", () => {
    it("should execute self-service onboarding for a new real estate company", async () => {
      saasRepo.onboardTenant = async () => ({
        tenant: {
          id: testTenantId,
          name: "Imobiliária Inovação",
          slug: "imobiliaria-inovacao",
          status: "ACTIVE",
          timezone: "America/Sao_Paulo",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        owner: {
          id: testOwnerId,
          name: "Carlos Diretor",
          email: "carlos@inovacao.com",
          phone: "5511988880000",
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        member: {
          id: "mem-01",
          tenant_id: testTenantId,
          profile_id: testOwnerId,
          role: "OWNER",
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        plan: "INDIVIDUAL",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/saas/onboarding",
        payload: {
          companyName: "Imobiliária Inovação",
          slug: "imobiliaria-inovacao",
          ownerName: "Carlos Diretor",
          ownerEmail: "carlos@inovacao.com",
          ownerPhone: "5511988880000",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.tenant.name).toBe("Imobiliária Inovação");
      expect(body.membership.role).toBe("OWNER");
    });
  });

  describe("GET /api/saas/subscription", () => {
    it("should return tenant subscription and limit consumption", async () => {
      saasRepo.getSubscription = async () => ({
        tenantId: testTenantId,
        plan: "INDIVIDUAL",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        usage: {
          leadsThisMonth: 12,
          activeMembers: 1,
          connectedChannels: 1,
        },
        limits: PLAN_LIMITS.INDIVIDUAL,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/saas/subscription",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.subscription.plan).toBe("INDIVIDUAL");
      expect(body.subscription.usage.leadsThisMonth).toBe(12);
    });
  });

  describe("POST /api/saas/subscription/upgrade", () => {
    it("should upgrade commercial plan", async () => {
      saasRepo.upgradePlan = async () => ({
        tenantId: testTenantId,
        plan: "BUSINESS",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        usage: {
          leadsThisMonth: 12,
          activeMembers: 1,
          connectedChannels: 1,
        },
        limits: PLAN_LIMITS.BUSINESS,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/saas/subscription/upgrade",
        headers: { "x-tenant-id": testTenantId, "x-user-id": testOwnerId },
        payload: {
          plan: "BUSINESS",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.subscription.plan).toBe("BUSINESS");
    });
  });

  describe("POST /api/saas/members/invite", () => {
    it("should invite a team member with role", async () => {
      saasRepo.inviteMember = async () => ({
        id: "mem-02",
        tenant_id: testTenantId,
        profile_id: "prof-02",
        role: "AGENT",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/saas/members/invite",
        headers: { "x-tenant-id": testTenantId, "x-user-id": testOwnerId },
        payload: {
          name: "Fernanda Corretora",
          email: "fernanda@inovacao.com",
          role: "AGENT",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.member.role).toBe("AGENT");
    });
  });

  describe("GET /api/saas/members", () => {
    it("should list tenant team members", async () => {
      tenantRepo.listMembers = async () => [
        {
          id: "mem-01",
          tenant_id: testTenantId,
          profile_id: testOwnerId,
          role: "OWNER",
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profile: {
            id: testOwnerId,
            auth_user_id: null,
            name: "Carlos Diretor",
            email: "carlos@inovacao.com",
            phone: null,
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      ];

      const response = await app.inject({
        method: "GET",
        url: "/api/saas/members",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.members.length).toBe(1);
    });
  });

  describe("PATCH /api/saas/settings/branding", () => {
    it("should update tenant branding settings", async () => {
      saasRepo.updateBranding = async () => ({
        success: true,
        branding: {
          companyName: "Inovação Imobiliária Premium",
          toneOfVoice: "Elegante e prestativo",
        },
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/saas/settings/branding",
        headers: { "x-tenant-id": testTenantId, "x-user-id": testOwnerId },
        payload: {
          companyName: "Inovação Imobiliária Premium",
          toneOfVoice: "Elegante e prestativo",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.branding.companyName).toBe("Inovação Imobiliária Premium");
    });
  });

  describe("GET /api/saas/audit-logs", () => {
    it("should list administrative audit logs", async () => {
      saasRepo.getAuditLogs = async () => [
        {
          id: "log-01",
          tenant_id: testTenantId,
          actor_type: "USER",
          actor_id: testOwnerId,
          action: "TENANT_ONBOARDED",
          entity_type: "TENANT",
          entity_id: testTenantId,
          metadata_json: {},
          created_at: new Date().toISOString(),
        },
      ];

      const response = await app.inject({
        method: "GET",
        url: "/api/saas/audit-logs",
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.auditLogs.length).toBe(1);
    });
  });
});
