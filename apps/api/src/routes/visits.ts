import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { VisitRepository, LeadRepository, FollowupRepository } from "@nexora/database";
import { VisitService, FollowupScheduler } from "@nexora/messaging";
import type { VisitStatus } from "@nexora/shared";
import { tenantContext } from "../plugins/auth.js";

export interface VisitPluginOptions {
  visitRepo?: VisitRepository;
  leadRepo?: LeadRepository;
  visitService?: VisitService;
}

export const visitRoutes: FastifyPluginAsync<VisitPluginOptions> = async (fastify, opts) => {
  const visitRepo = opts?.visitRepo || new VisitRepository();
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const followupRepo = new FollowupRepository();
  const followupScheduler = new FollowupScheduler({ followupRepo, leadRepo });

  const visitService =
    opts?.visitService ||
    new VisitService({
      visitRepo,
      leadRepo,
      followupScheduler,
    });

  // ----------------------------------------------------------------------------
  // Listar Visitas
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/visits",
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: VisitStatus;
          leadId?: string;
          assignedUserId?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { status, leadId, assignedUserId } = request.query;
      const limit = Number(request.query.limit) || 50;
      const offset = Number(request.query.offset) || 0;

      try {
        const visits = await visitRepo.list(
          { tenantId },
          { status, leadId, assignedUserId, limit, offset },
        );

        return reply.status(200).send({
          success: true,
          visits,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar visitas");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar visitas",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Obter Detalhes da Visita
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/visits/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const visit = await visitRepo.findById({ tenantId }, id);
        if (!visit) {
          return reply.status(404).send({
            success: false,
            error: "Visita não encontrada",
          });
        }

        return reply.status(200).send({
          success: true,
          visit,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao carregar visita");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao carregar visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Criar / Agendar Nova Visita
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits",
    async (
      request: FastifyRequest<{
        Body: {
          leadId: string;
          propertyId?: string | null;
          assignedUserId?: string | null;
          scheduledAt: string;
          feedback?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { leadId, propertyId, assignedUserId, scheduledAt, feedback } = request.body;

      if (!leadId || !scheduledAt) {
        return reply.status(400).send({
          success: false,
          error: "leadId e scheduledAt são obrigatórios.",
        });
      }

      try {
        const visit = await visitService.scheduleVisit(
          { tenantId },
          { leadId, propertyId, assignedUserId, scheduledAt, feedback },
        );

        return reply.status(201).send({
          success: true,
          visit,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao agendar visita");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao agendar visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Reagendar Visita
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits/:id/reschedule",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { scheduledAt: string; reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const { scheduledAt, reason } = request.body;
      if (!scheduledAt) {
        return reply.status(400).send({
          success: false,
          error: "Novo horário (scheduledAt) é obrigatório.",
        });
      }

      try {
        const updated = await visitService.rescheduleVisit({ tenantId }, id, scheduledAt, reason);

        return reply.status(200).send({
          success: true,
          visit: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao reagendar visita");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao reagendar visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Cancelar Visita
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits/:id/cancel",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const reason = request.body?.reason || "Cancelamento informado pelo cliente";

      try {
        const updated = await visitService.cancelVisit({ tenantId }, id, reason);

        return reply.status(200).send({
          success: true,
          visit: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao cancelar visita");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao cancelar visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Concluir Visita (Dispara Follow-up Pós-visita — DoD)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits/:id/complete",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { feedback?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const feedback = request.body?.feedback;

      try {
        const result = await visitService.completeVisit({ tenantId }, id, feedback);

        return reply.status(200).send({
          success: true,
          visit: result.visit,
          followupJobScheduled: result.followupJobScheduled,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao concluir visita");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao concluir visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Registrar No-Show (Não comparecimento)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits/:id/no-show",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const reason = request.body?.reason;

      try {
        const updated = await visitService.markNoShow({ tenantId }, id, reason);

        return reply.status(200).send({
          success: true,
          visit: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao registrar no-show");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao registrar no-show",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Registrar Feedback Pós-visita
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/visits/:id/feedback",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { feedback: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const { feedback } = request.body;
      if (!feedback) {
        return reply.status(400).send({
          success: false,
          error: "O texto do feedback é obrigatório.",
        });
      }

      try {
        const updated = await visitService.recordFeedback({ tenantId }, id, feedback);

        return reply.status(200).send({
          success: true,
          visit: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao registrar feedback");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao registrar feedback",
        });
      }
    },
  );
};
