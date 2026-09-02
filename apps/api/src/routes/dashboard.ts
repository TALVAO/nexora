import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { LeadRepository } from "@nexora/database";
import { tenantContext } from "../plugins/auth.js";

export interface DashboardPluginOptions {
  leadRepo?: LeadRepository;
}

export const dashboardRoutes: FastifyPluginAsync<DashboardPluginOptions> = async (
  fastify,
  opts,
) => {
  const leadRepo = opts?.leadRepo || new LeadRepository();

  // ----------------------------------------------------------------------------
  // Obter Métricas do Dashboard Comercial
  // ----------------------------------------------------------------------------
  fastify.get("/api/dashboard/metrics", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = tenantContext(request);

    try {
      const metrics = await leadRepo.getDashboardMetrics({ tenantId });

      return reply.status(200).send({
        success: true,
        metrics,
      });
    } catch (err: unknown) {
      request.log.error(err, "Erro ao obter métricas do dashboard");
      return reply.status(500).send({
        success: false,
        error: err instanceof Error ? err.message : "Erro ao obter métricas",
      });
    }
  });
};
