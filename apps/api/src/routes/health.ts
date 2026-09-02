import type { FastifyPluginAsync } from "fastify";
import type { HealthCheckResponse } from "@nexora/shared";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", { config: { access: "public" as const } }, async (_request, reply) => {
    const response: HealthCheckResponse = {
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    return reply.status(200).send(response);
  });
};
