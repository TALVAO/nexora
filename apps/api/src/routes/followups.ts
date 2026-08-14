import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { FollowupRepository, LeadRepository } from "@nexora/database";
import { FollowupScheduler } from "@nexora/messaging";
import type { FollowupStatus } from "@nexora/shared";

export interface FollowupPluginOptions {
  followupRepo?: FollowupRepository;
  leadRepo?: LeadRepository;
  scheduler?: FollowupScheduler;
}

export const followupRoutes: FastifyPluginAsync<FollowupPluginOptions> = async (fastify, opts) => {
  const followupRepo = opts?.followupRepo || new FollowupRepository();
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const scheduler = opts?.scheduler || new FollowupScheduler({ followupRepo, leadRepo });

  // ----------------------------------------------------------------------------
  // Listar Jobs de Follow-up
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/followups/jobs",
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: FollowupStatus;
          leadId?: string;
          limit?: string;
        };
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      const { status, leadId } = request.query;
      const limit = Number(request.query.limit) || 50;

      try {
        const jobs = await followupRepo.listJobs({ tenantId }, { status, leadId, limit });

        return reply.status(200).send({
          success: true,
          jobs,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar jobs de follow-up");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar jobs",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Agendar Novo Job de Follow-up
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/followups/jobs",
    async (
      request: FastifyRequest<{
        Body: {
          leadId: string;
          conversationId?: string | null;
          sequenceId?: string | null;
          stepId?: string | null;
          scheduledAt: string;
        };
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      const { leadId, conversationId, sequenceId, stepId, scheduledAt } = request.body;

      if (!leadId || !scheduledAt) {
        return reply.status(400).send({
          success: false,
          error: "leadId e scheduledAt são obrigatórios.",
        });
      }

      try {
        const job = await scheduler.scheduleJob(
          { tenantId },
          { leadId, conversationId, sequenceId, stepId, scheduledAt },
        );

        return reply.status(201).send({
          success: true,
          job,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao agendar job de follow-up");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao agendar follow-up",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Cancelar Job de Follow-up
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/followups/jobs/:id/cancel",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      const reason = request.body?.reason || "Cancelamento manual solicitado pelo corretor";

      try {
        const cancelled = await followupRepo.cancelJob({ tenantId }, id, reason);
        if (!cancelled) {
          return reply.status(404).send({
            success: false,
            error: "Job de follow-up não encontrado ou não está pendente.",
          });
        }

        return reply.status(200).send({
          success: true,
          message: "Job de follow-up cancelado com sucesso.",
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao cancelar job de follow-up");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao cancelar follow-up",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Processar Fila de Jobs Vencidos (Processador / Worker)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/followups/process",
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
        const stats = await scheduler.processDueJobs({ tenantId }, "api-worker");

        return reply.status(200).send({
          success: true,
          stats,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao processar fila de follow-ups");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao processar fila",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Listar Sequências de Follow-up
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/followups/sequences",
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
        const sequences = await followupRepo.listSequences({ tenantId });

        return reply.status(200).send({
          success: true,
          sequences,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar sequências de follow-up");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar sequências",
        });
      }
    },
  );
};
