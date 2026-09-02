import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Role } from "@nexora/shared";
import { LeadRepository, SaasRepository, type TenantContext } from "@nexora/database";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo, TEST_TENANT_ID } from "../test-utils/auth.js";

/** Sobe uma instância cujo usuário autenticado tem o papel informado. */
async function buildAppAsRole(role: Role): Promise<FastifyInstance> {
  const leadRepo = new LeadRepository();
  leadRepo.listWithFilters = async () => ({ leads: [], total: 0 });
  leadRepo.update = async () => null;
  leadRepo.mergeLeads = async () => ({ merged: true, absorbedLeadId: "x" }) as never;

  const saasRepo = new SaasRepository();
  saasRepo.upgradePlan = async () => ({ plan: "TEAM" }) as never;

  const tenantRepo = createAuthTestTenantRepo(undefined, role);
  tenantRepo.listMembers = async () => [];

  const app = await buildApp({ leadRepo, saasRepo, tenantRepo });
  await app.ready();
  return app;
}

describe("Autorização por papel — RBAC (Etapa 13.2)", () => {
  let owner: FastifyInstance;
  let manager: FastifyInstance;
  let agent: FastifyInstance;
  let viewer: FastifyInstance;

  beforeAll(async () => {
    [owner, manager, agent, viewer] = await Promise.all([
      buildAppAsRole("OWNER"),
      buildAppAsRole("MANAGER"),
      buildAppAsRole("AGENT"),
      buildAppAsRole("VIEWER"),
    ]);
  });

  afterAll(async () => {
    await Promise.all([owner.close(), manager.close(), agent.close(), viewer.close()]);
  });

  // --------------------------------------------------------------------------
  describe("VIEWER é somente leitura", () => {
    it("permite leitura", async () => {
      const response = await viewer.inject({
        method: "GET",
        url: "/api/leads",
        headers: authHeaders(viewer),
      });
      expect(response.statusCode).toBe(200);
    });

    it("bloqueia escrita mesmo em rota sem restrição declarada", async () => {
      const response = await viewer.inject({
        method: "PATCH",
        url: "/api/leads/lead-1",
        headers: authHeaders(viewer),
        payload: { name: "Alterado por quem não devia" },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain("somente leitura");
    });

    it("bloqueia POST de escrita", async () => {
      const response = await viewer.inject({
        method: "POST",
        url: "/api/leads/lead-1/activities",
        headers: authHeaders(viewer),
        payload: { activity_type: "NOTE", description: "nota" },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  describe("Rotas restritas a OWNER", () => {
    it("permite ao OWNER trocar o plano", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/saas/subscription/upgrade",
        headers: authHeaders(owner),
        payload: { plan: "TEAM" },
      });
      expect(response.statusCode).toBe(200);
    });

    it("bloqueia MANAGER de trocar o plano", async () => {
      const response = await manager.inject({
        method: "POST",
        url: "/api/saas/subscription/upgrade",
        headers: authHeaders(manager),
        payload: { plan: "TEAM" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("bloqueia AGENT de trocar o plano", async () => {
      const response = await agent.inject({
        method: "POST",
        url: "/api/saas/subscription/upgrade",
        headers: authHeaders(agent),
        payload: { plan: "TEAM" },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  describe("Rotas restritas a OWNER e MANAGER", () => {
    it("permite ao MANAGER listar membros", async () => {
      const response = await manager.inject({
        method: "GET",
        url: "/api/saas/members",
        headers: authHeaders(manager),
      });
      expect(response.statusCode).toBe(200);
    });

    it("bloqueia AGENT de listar membros", async () => {
      const response = await agent.inject({
        method: "GET",
        url: "/api/saas/members",
        headers: authHeaders(agent),
      });
      expect(response.statusCode).toBe(403);
    });

    it("bloqueia AGENT de fundir leads (operação destrutiva)", async () => {
      const response = await agent.inject({
        method: "POST",
        url: "/api/leads/lead-1/merge",
        headers: authHeaders(agent),
        payload: { targetLeadId: "lead-2" },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  describe("AGENT mantém o trabalho do dia a dia", () => {
    it("permite ao AGENT operar em rota sem restrição declarada", async () => {
      const app = await buildAppAsRole("AGENT");
      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: authHeaders(app),
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it("resolve o tenant do vínculo para qualquer papel", async () => {
      let seen: TenantContext | null = null;
      const leadRepo = new LeadRepository();
      leadRepo.listWithFilters = async (ctx: TenantContext) => {
        seen = ctx;
        return { leads: [], total: 0 };
      };
      const app = await buildApp({
        leadRepo,
        tenantRepo: createAuthTestTenantRepo(undefined, "AGENT"),
      });
      await app.ready();

      await app.inject({ method: "GET", url: "/api/leads", headers: authHeaders(app) });

      expect(seen).not.toBeNull();
      expect(seen!.tenantId).toBe(TEST_TENANT_ID);
      await app.close();
    });
  });
});
