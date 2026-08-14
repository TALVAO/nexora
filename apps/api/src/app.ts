import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes, type WebhookPluginOptions } from "./routes/webhooks.js";
import { conversationRoutes, type ConversationPluginOptions } from "./routes/conversations.js";
import { leadRoutes, type LeadsPluginOptions } from "./routes/leads.js";
import { dashboardRoutes, type DashboardPluginOptions } from "./routes/dashboard.js";
import { followupRoutes, type FollowupPluginOptions } from "./routes/followups.js";
import type {
  MessageGateway,
  EvolutionWhatsAppProvider,
  FollowupScheduler,
} from "@nexora/messaging";
import type { MessageRepository, LeadRepository, FollowupRepository } from "@nexora/database";

export interface AppOptions {
  gateway?: MessageGateway;
  messageRepo?: MessageRepository;
  leadRepo?: LeadRepository;
  followupRepo?: FollowupRepository;
  scheduler?: FollowupScheduler;
  evolutionProvider?: EvolutionWhatsAppProvider;
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

  // Rotas base, CRM e Follow-up Engine
  await app.register(healthRoutes);
  await app.register(webhookRoutes, {
    gateway: options?.gateway,
  } as WebhookPluginOptions);
  await app.register(conversationRoutes, {
    gateway: options?.gateway,
    messageRepo: options?.messageRepo,
    evolutionProvider: options?.evolutionProvider,
  } as ConversationPluginOptions);
  await app.register(leadRoutes, {
    leadRepo: options?.leadRepo,
  } as LeadsPluginOptions);
  await app.register(dashboardRoutes, {
    leadRepo: options?.leadRepo,
  } as DashboardPluginOptions);
  await app.register(followupRoutes, {
    followupRepo: options?.followupRepo,
    leadRepo: options?.leadRepo,
    scheduler: options?.scheduler,
  } as FollowupPluginOptions);

  return app;
}
