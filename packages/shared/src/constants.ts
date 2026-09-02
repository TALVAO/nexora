export const APP_NAME = "Nexora";
export const DEFAULT_PAGE_SIZE = 20;

export const STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFYING",
  "QUALIFIED",
  "VISIT_SCHEDULED",
  "VISITED",
  "PROPOSAL",
  "WON",
  "LOST",
  "DORMANT",
] as const;

export const ROLES = ["OWNER", "MANAGER", "AGENT", "VIEWER"] as const;

export const CHANNELS = ["WHATSAPP", "INSTAGRAM"] as const;

export const AUTOMATION_MODES = ["AI", "HUMAN"] as const;

export const TEMPERATURES = ["HOT", "WARM", "COLD"] as const;

export const FOLLOWUP_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "CANCELLED",
  "BLOCKED",
  "FAILED",
] as const;

export const VISIT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export const PROPERTY_STATUSES = ["AVAILABLE", "RENTED", "SOLD", "RESERVED"] as const;

/**
 * De onde veio a última afirmação sobre a disponibilidade de um imóvel
 * (`properties.availability_source`, migration 05). Espelha o enum
 * `availability_source` do Postgres.
 */
export const AVAILABILITY_SOURCES = [
  "MANUAL",
  "XML_FEED",
  "CRM_API",
  "AGENT_CONFIRMED",
] as const;

export const PLANS = ["INDIVIDUAL", "TEAM", "BUSINESS"] as const;

export const PLAN_LIMITS = {
  INDIVIDUAL: {
    maxUsers: 1,
    maxChannels: 1,
    maxLeadsPerMonth: 100,
    features: ["Locação prioritária", "Follow-up automático básico", "CRM conversacional"],
  },
  TEAM: {
    maxUsers: 5,
    maxChannels: 2,
    maxLeadsPerMonth: 500,
    features: [
      "Múltiplos corretores",
      "Roteamento de leads",
      "Relatórios de equipe",
      "Locação e Venda",
    ],
  },
  BUSINESS: {
    maxUsers: 9999,
    maxChannels: 10,
    maxLeadsPerMonth: 999999,
    features: [
      "Usuários ilimitados",
      "Múltiplos times",
      "Branding customizado",
      "Sincronização com CRM externo",
      "API dedicada",
    ],
  },
} as const;
