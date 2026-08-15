import { describe, it, expect, vi } from "vitest";
import { SaasRepository } from "../repositories/saas.repository.js";
import { PLAN_LIMITS } from "@nexora/shared";

describe("SaasRepository & SaaS Commercial Management (Etapa 12)", () => {
  const saasRepo = new SaasRepository();
  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testOwnerId = "owner-saas-001";

  it("should execute self-service onboarding flow", async () => {
    saasRepo.onboardTenant = vi.fn().mockResolvedValue({
      tenant: {
        id: testTenantId,
        name: "Imobiliária Futura",
        slug: "imobiliaria-futura",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      owner: {
        id: testOwnerId,
        name: "Roberto Diretor",
        email: "roberto@futura.com",
        phone: "5511999990000",
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      member: {
        id: "mem-001",
        tenant_id: testTenantId,
        profile_id: testOwnerId,
        role: "OWNER",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      plan: "TEAM",
    });

    const res = await saasRepo.onboardTenant({
      companyName: "Imobiliária Futura",
      slug: "imobiliaria-futura",
      ownerName: "Roberto Diretor",
      ownerEmail: "roberto@futura.com",
      ownerPhone: "5511999990000",
      plan: "TEAM",
    });

    expect(res.tenant.id).toBe(testTenantId);
    expect(res.owner.email).toBe("roberto@futura.com");
    expect(res.member.role).toBe("OWNER");
    expect(res.plan).toBe("TEAM");
  });

  it("should return tenant subscription and limit usage", async () => {
    saasRepo.getSubscription = vi.fn().mockResolvedValue({
      tenantId: testTenantId,
      plan: "INDIVIDUAL",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      usage: {
        leadsThisMonth: 34,
        activeMembers: 1,
        connectedChannels: 1,
      },
      limits: PLAN_LIMITS.INDIVIDUAL,
    });

    const sub = await saasRepo.getSubscription(testTenantId);

    expect(sub.plan).toBe("INDIVIDUAL");
    expect(sub.usage.leadsThisMonth).toBe(34);
    expect(sub.limits.maxLeadsPerMonth).toBe(100);
    expect(sub.limits.maxUsers).toBe(1);
  });

  it("should upgrade commercial plan and log audit", async () => {
    saasRepo.upgradePlan = vi.fn().mockResolvedValue({
      tenantId: testTenantId,
      plan: "BUSINESS",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      usage: {
        leadsThisMonth: 34,
        activeMembers: 1,
        connectedChannels: 1,
      },
      limits: PLAN_LIMITS.BUSINESS,
    });

    const upgraded = await saasRepo.upgradePlan(testTenantId, "BUSINESS", testOwnerId);

    expect(upgraded.plan).toBe("BUSINESS");
    expect(upgraded.limits.maxUsers).toBe(9999);
  });

  it("should invite new team member with specific role", async () => {
    saasRepo.inviteMember = vi.fn().mockResolvedValue({
      id: "mem-002",
      tenant_id: testTenantId,
      profile_id: "prof-002",
      role: "AGENT",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const member = await saasRepo.inviteMember(
      testTenantId,
      {
        name: "Juliana Corretora",
        email: "juliana@futura.com",
        phone: "5511988887777",
        role: "AGENT",
      },
      testOwnerId,
    );

    expect(member.role).toBe("AGENT");
  });

  it("should update tenant branding and tone of voice", async () => {
    saasRepo.updateBranding = vi.fn().mockResolvedValue({
      success: true,
      branding: {
        companyName: "Futura Prime Imóveis",
        primaryColor: "#0f172a",
        toneOfVoice: "Consultivo, cordial e objetivo",
      },
    });

    const res = await saasRepo.updateBranding(
      testTenantId,
      {
        companyName: "Futura Prime Imóveis",
        primaryColor: "#0f172a",
        toneOfVoice: "Consultivo, cordial e objetivo",
      },
      testOwnerId,
    );

    expect(res.success).toBe(true);
    expect(res.branding.companyName).toBe("Futura Prime Imóveis");
  });

  it("should list administrative audit logs", async () => {
    saasRepo.getAuditLogs = vi.fn().mockResolvedValue([
      {
        id: "audit-001",
        tenant_id: testTenantId,
        actor_type: "USER",
        actor_id: testOwnerId,
        action: "PLAN_UPGRADE",
        entity_type: "SUBSCRIPTION",
        entity_id: testTenantId,
        metadata_json: { newPlan: "BUSINESS" },
        created_at: new Date().toISOString(),
      },
    ]);

    const logs = await saasRepo.getAuditLogs(testTenantId);

    expect(logs.length).toBe(1);
    expect(logs[0]!.action).toBe("PLAN_UPGRADE");
  });
});
