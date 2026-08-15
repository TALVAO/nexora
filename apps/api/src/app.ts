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
import { visitRoutes, type VisitPluginOptions } from "./routes/visits.js";
import { propertyRoutes, type PropertyPluginOptions } from "./routes/properties.js";
import { crmRoutes, type CRMPluginOptions } from "./routes/crm.js";
import type {
  MessageGateway,
  EvolutionWhatsAppProvider,
  FollowupScheduler,
  VisitService,
  PropertyMatcher,
  CsvPropertyImporter,
} from "@nexora/messaging";
import type {
  MessageRepository,
  LeadRepository,
  FollowupRepository,
  VisitRepository,
  PropertyRepository,
} from "@nexora/database";
import type { CRMSyncService } from "@nexora/crm";

export interface AppOptions {
  gateway?: MessageGateway;
  messageRepo?: MessageRepository;
  leadRepo?: LeadRepository;
  followupRepo?: FollowupRepository;
  visitRepo?: VisitRepository;
  propertyRepo?: PropertyRepository;
  scheduler?: FollowupScheduler;
  visitService?: VisitService;
  matcher?: PropertyMatcher;
  csvImporter?: CsvPropertyImporter;
  crmService?: CRMSyncService;
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

  // Rotas base, CRM interno, Follow-up Engine, Visitas, Catálogo e CRM Externo
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
  await app.register(visitRoutes, {
    visitRepo: options?.visitRepo,
    leadRepo: options?.leadRepo,
    visitService: options?.visitService,
  } as VisitPluginOptions);
  await app.register(propertyRoutes, {
    propertyRepo: options?.propertyRepo,
    leadRepo: options?.leadRepo,
    matcher: options?.matcher,
    csvImporter: options?.csvImporter,
  } as PropertyPluginOptions);
  await app.register(crmRoutes, {
    leadRepo: options?.leadRepo,
    visitRepo: options?.visitRepo,
    crmService: options?.crmService,
  } as CRMPluginOptions);

  return app;
}
