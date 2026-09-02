import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { PilotRepository, type RecordIncidentInput } from "@nexora/database";
import { tenantContext } from "../plugins/auth.js";

export interface PilotPluginOptions {
  pilotRepo?: PilotRepository;
}

export const pilotRoutes: FastifyPluginAsync<PilotPluginOptions> = async (fastify, opts) => {
  const pilotRepo = opts?.pilotRepo || new PilotRepository();

  // ----------------------------------------------------------------------------
  // Obter Métricas Operacionais Diárias do Piloto Real
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/pilot/metrics",
    async (
      request: FastifyRequest<{
        Querystring: { from?: string; to?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { from, to } = request.query;

      try {
        const metrics = await pilotRepo.getDailyMetrics({ tenantId }, { from, to });

        return reply.status(200).send({
          success: true,
          metrics,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao obter métricas do piloto");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao obter métricas do piloto",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Registrar Incidente / Observação Operacional no Piloto
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/pilot/incidents",
    async (
      request: FastifyRequest<{
        Body: RecordIncidentInput;
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { incidentType, description, expectedBehavior, actualBehavior, severity } =
        request.body;

      if (!incidentType || !description) {
        return reply.status(400).send({
          success: false,
          error: "incidentType e description são obrigatórios.",
        });
      }

      try {
        const result = await pilotRepo.recordIncident(
          { tenantId },
          {
            incidentType,
            description,
            expectedBehavior,
            actualBehavior,
            severity,
          },
        );

        return reply.status(201).send({
          success: true,
          incidentId: result.id,
          recordedAt: result.recordedAt,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao registrar incidente de piloto");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao registrar incidente",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Listar Incidentes Reportados no Piloto
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/pilot/incidents",
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const limit = Number(request.query.limit) || 50;

      try {
        const incidents = await pilotRepo.listIncidents({ tenantId }, limit);

        return reply.status(200).send({
          success: true,
          incidents,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar incidentes do piloto");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar incidentes",
        });
      }
    },
  );
};
