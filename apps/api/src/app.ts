import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes, type WebhookPluginOptions } from "./routes/webhooks.js";
import type { MessageGateway } from "@nexora/messaging";

export interface AppOptions {
  gateway?: MessageGateway;
}

export async function buildApp(options?: AppOptions): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === "production",
  });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rotas base
  await app.register(healthRoutes);
  await app.register(webhookRoutes, {
    gateway: options?.gateway,
  } as WebhookPluginOptions);

  return app;
}
