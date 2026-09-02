import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { registerAuth } from "./plugins/auth.js";
import { registerTenantSession } from "./plugins/tenant-session.js";
import { registerRawBody } from "./plugins/raw-body.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes, type WebhookPluginOptions } from "./routes/webhooks.js";
import { conversationRoutes, type ConversationPluginOptions } from "./routes/conversations.js";
import { leadRoutes, type LeadsPluginOptions } from "./routes/leads.js";
import { dashboardRoutes, type DashboardPluginOptions } from "./routes/dashboard.js";
import { followupRoutes, type FollowupPluginOptions } from "./routes/followups.js";
import { visitRoutes, type VisitPluginOptions } from "./routes/visits.js";
import { propertyRoutes, type PropertyPluginOptions } from "./routes/properties.js";
import { crmRoutes, type CRMPluginOptions } from "./routes/crm.js";
import { pilotRoutes, type PilotPluginOptions } from "./routes/pilot.js";
import { saasRoutes, type SaasPluginOptions } from "./routes/saas.js";
import { vocabularyRoutes, type VocabularyPluginOptions } from "./routes/vocabulary.js";
import type {
  MessageGateway,
  EvolutionWhatsAppProvider,
  FollowupScheduler,
  VisitService,
  PropertyMatcher,
  CsvPropertyImporter,
  VrSyncPropertyImporter,
} from "@nexora/messaging";
import type {
  MessageRepository,
  LeadRepository,
  FollowupRepository,
  VisitRepository,
  PropertyRepository,
  PilotRepository,
  TenantRepository,
  SaasRepository,
  VocabularyRepository,
  ChannelConnectionRepository,
} from "@nexora/database";
import type { CRMSyncService } from "@nexora/crm";

export interface AppOptions {
  gateway?: MessageGateway;
  messageRepo?: MessageRepository;
  leadRepo?: LeadRepository;
  followupRepo?: FollowupRepository;
  visitRepo?: VisitRepository;
  propertyRepo?: PropertyRepository;
  pilotRepo?: PilotRepository;
  tenantRepo?: TenantRepository;
  vocabularyRepo?: VocabularyRepository;
  channelRepo?: ChannelConnectionRepository;
  /** Liga a transação de tenant com RLS. Padrão: desligado sob NODE_ENV=test. */
  enableTenantSession?: boolean;
  saasRepo?: SaasRepository;
  scheduler?: FollowupScheduler;
  visitService?: VisitService;
  matcher?: PropertyMatcher;
  csvImporter?: CsvPropertyImporter;
  vrsyncImporter?: VrSyncPropertyImporter;
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

  // Autenticação + resolução de tenant. Precisa vir ANTES de qualquer rota:
  // o hook global só alcança rotas registradas depois dele.
  // Precisa vir antes das rotas: o parser de corpo é resolvido no roteamento.
  registerRawBody(app);

  await registerAuth(app, { tenantRepo: options?.tenantRepo });

  // Precisa vir antes das rotas: o hook onRoute só alcança rotas registradas
  // depois dele.
  registerTenantSession(app, { enabled: options?.enableTenantSession });

  // Rotas base, CRM interno, Follow-up Engine, Visitas, Catálogo, CRM Externo, Piloto e SaaS Comercial
  await app.register(healthRoutes);
  await app.register(webhookRoutes, {
    gateway: options?.gateway,
    channelRepo: options?.channelRepo,
    enableTenantSession: options?.enableTenantSession,
  } as WebhookPluginOptions);
  await app.register(conversationRoutes, {
    gateway: options?.gateway,
    messageRepo: options?.messageRepo,
    evolutionProvider: options?.evolutionProvider,
  } as ConversationPluginOptions);
  await app.register(leadRoutes, {
    leadRepo: options?.leadRepo,
    gateway: options?.gateway,
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
    // Usado só para ler a janela de validade da disponibilidade do tenant
    // (Etapa 15.1), nunca para resolver quem é o tenant da requisição.
    tenantRepo: options?.tenantRepo,
    matcher: options?.matcher,
    csvImporter: options?.csvImporter,
    vrsyncImporter: options?.vrsyncImporter,
  } as PropertyPluginOptions);
  await app.register(crmRoutes, {
    leadRepo: options?.leadRepo,
    visitRepo: options?.visitRepo,
    crmService: options?.crmService,
  } as CRMPluginOptions);
  await app.register(pilotRoutes, {
    pilotRepo: options?.pilotRepo,
  } as PilotPluginOptions);
  await app.register(saasRoutes, {
    saasRepo: options?.saasRepo,
    tenantRepo: options?.tenantRepo,
  } as SaasPluginOptions);
  await app.register(vocabularyRoutes, {
    vocabularyRepo: options?.vocabularyRepo,
  } as VocabularyPluginOptions);

  return app;
}
