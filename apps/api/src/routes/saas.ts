import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  SaasRepository,
  TenantRepository,
  type OnboardingInput,
  type InviteMemberInput,
  type BrandingSettings,
} from "@nexora/database";
import { type PlanType, PLANS, PLAN_LIMITS } from "@nexora/shared";

export interface SaasPluginOptions {
  saasRepo?: SaasRepository;
  tenantRepo?: TenantRepository;
}

export const saasRoutes: FastifyPluginAsync<SaasPluginOptions> = async (fastify, opts) => {
  const saasRepo = opts?.saasRepo || new SaasRepository();
  const tenantRepo = opts?.tenantRepo || new TenantRepository();

  // ----------------------------------------------------------------------------
  // Catálogo Público de Planos Comerciais
  // ----------------------------------------------------------------------------
  fastify.get("/api/saas/plans", async (_request: FastifyRequest, reply: FastifyReply) => {
    const plans = PLANS.map((p) => ({
      id: p,
      name:
        p === "INDIVIDUAL"
          ? "Corretor Autônomo"
          : p === "TEAM"
            ? "Equipe / Time"
            : "Imobiliária Enterprise",
      limits: PLAN_LIMITS[p],
    }));

    return reply.status(200).send({
      success: true,
      plans,
    });
  });

  // ----------------------------------------------------------------------------
  // Onboarding Self-Service (Criação de Tenant + Owner + Plano)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/saas/onboarding",
    async (
      request: FastifyRequest<{
        Body: OnboardingInput;
      }>,
      reply: FastifyReply,
    ) => {
      const { companyName, slug, ownerName, ownerEmail } = request.body;

      if (!companyName || !slug || !ownerName || !ownerEmail) {
        return reply.status(400).send({
          success: false,
          error: "companyName, slug, ownerName e ownerEmail são obrigatórios.",
        });
      }

      try {
        const result = await saasRepo.onboardTenant(request.body);

        return reply.status(201).send({
          success: true,
          tenant: result.tenant,
          owner: result.owner,
          membership: result.member,
          plan: result.plan,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro no onboarding de tenant");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro no onboarding",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Consultar Assinatura e Consumo de Limites do Tenant
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/saas/subscription",
    async (
      request: FastifyRequest<{
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      try {
        const subscription = await saasRepo.getSubscription(tenantId);

        return reply.status(200).send({
          success: true,
          subscription,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao obter assinatura");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao obter assinatura",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Upgrade ou Troca de Plano Comercial
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/saas/subscription/upgrade",
    async (
      request: FastifyRequest<{
        Body: { plan: PlanType };
        Headers: { "x-tenant-id"?: string; "x-user-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";
      const userId = request.headers["x-user-id"];

      const { plan } = request.body;
      if (!plan || !PLANS.includes(plan)) {
        return reply.status(400).send({
          success: false,
          error: `Plano inválido. Opções: ${PLANS.join(", ")}`,
        });
      }

      try {
        const updated = await saasRepo.upgradePlan(tenantId, plan, userId);

        return reply.status(200).send({
          success: true,
          subscription: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao atualizar plano");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao atualizar plano",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Convidar Membro / Corretor para a Equipe
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/saas/members/invite",
    async (
      request: FastifyRequest<{
        Body: InviteMemberInput;
        Headers: { "x-tenant-id"?: string; "x-user-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";
      const actorUserId = request.headers["x-user-id"];

      const { name, email, role } = request.body;
      if (!name || !email || !role) {
        return reply.status(400).send({
          success: false,
          error: "name, email e role são obrigatórios.",
        });
      }

      try {
        const member = await saasRepo.inviteMember(tenantId, request.body, actorUserId);

        return reply.status(201).send({
          success: true,
          member,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao convidar membro");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao convidar membro",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Listar Membros da Equipe do Tenant
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/saas/members",
    async (
      request: FastifyRequest<{
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      try {
        const members = await tenantRepo.listMembers(tenantId);

        return reply.status(200).send({
          success: true,
          members,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar membros");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar membros",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Atualizar Configurações de Branding e Tom de Voz
  // ----------------------------------------------------------------------------
  fastify.patch(
    "/api/saas/settings/branding",
    async (
      request: FastifyRequest<{
        Body: BrandingSettings;
        Headers: { "x-tenant-id"?: string; "x-user-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";
      const actorUserId = request.headers["x-user-id"];

      try {
        const result = await saasRepo.updateBranding(tenantId, request.body, actorUserId);

        return reply.status(200).send({
          success: true,
          branding: result.branding,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao atualizar branding");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao atualizar branding",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Listar Logs de Auditoria Administrativa do Tenant
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/saas/audit-logs",
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string };
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      const limit = Number(request.query.limit) || 50;

      try {
        const auditLogs = await saasRepo.getAuditLogs(tenantId, limit);

        return reply.status(200).send({
          success: true,
          auditLogs,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar logs de auditoria");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar auditoria",
        });
      }
    },
  );
};
