import type { AutomationMode, Channel, PlanType, Stage, Temperature } from "@nexora/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Reexportados por conveniência: quem consome o cliente de API não precisa
// importar "@nexora/shared" separadamente só para tipar um LeadRow.
export type { AutomationMode, Channel, PlanType, Stage, Temperature };

/**
 * Erro tipado lançado quando a API responde fora da faixa 2xx (ou a
 * requisição falha na rede). Carrega o status HTTP para permitir tratamento
 * específico no chamador (ex.: 401 → redirecionar para /login).
 *
 * NOTA: `@nexora/shared` define um tipo `ApiResponse<T>` com envelope
 * {data, error:{code,message}} — isso é código morto, nenhuma rota do
 * backend usa esse formato. A API real responde {success, ...campos} no
 * sucesso e {success:false, error: string} na falha, então os tipos abaixo
 * são declarados localmente a partir do formato real.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Formato exato devolvido por GET /api/leads — snake_case, é o shape que o
 * backend serializa direto do banco, sem conversão para camelCase.
 */
export interface LeadRow {
  id: string;
  tenant_id: string;
  assigned_user_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: Channel;
  intent: string | null;
  stage: Stage;
  temperature: Temperature;
  score: number;
  automation_mode: AutomationMode;
  first_contact_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_action_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Formato do campo `metrics` devolvido por GET /api/dashboard/metrics. */
export interface DashboardMetrics {
  totalLeads: number;
  leadsByStage: Record<Stage, number>;
  leadsByTemperature: Record<Temperature, number>;
  leadsByAutomation: Record<AutomationMode, number>;
  activeConversations: number;
  scheduledVisits: number;
}

/** Formato do campo `subscription` devolvido por GET /api/saas/subscription. */
export interface SubscriptionInfo {
  tenantId: string;
  plan: PlanType;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  currentPeriodEnd: string;
  usage: {
    leadsThisMonth: number;
    activeMembers: number;
    connectedChannels: number;
  };
  limits: {
    maxUsers: number;
    maxChannels: number;
    maxLeadsPerMonth: number;
    features: string[];
  };
}

/** Formato do campo `profile` devolvido dentro de GET /api/leads/:id (Lead 360). */
export interface LeadProfileInfo {
  transaction_type: string | null;
  property_type: string | null;
  city: string | null;
  neighborhoods: string[];
  min_budget: number | null;
  max_budget: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  pet_required: boolean | null;
  financing_interest: boolean | null;
  move_date: string | null;
  rental_guarantee: string | null;
  qualification_complete: boolean;
}

/** Um item de `conversations` dentro de GET /api/leads/:id (Lead 360). */
export interface ConversationSummary {
  id: string;
  channel: Channel;
  provider: string;
  status: string;
  automation_mode: AutomationMode;
  last_message_at: string;
}

/** Um item de `recentMessages` dentro de GET /api/leads/:id (Lead 360). */
export interface MessageItem {
  id: string;
  conversation_id: string;
  direction: "INBOUND" | "OUTBOUND";
  sender_type: string;
  message_type: string;
  text: string | null;
  media_url: string | null;
  ai_generated: boolean;
  sent_at: string;
}

/** Formato do campo `data` devolvido por GET /api/leads/:id. */
export interface Lead360 {
  lead: LeadRow;
  profile: LeadProfileInfo | null;
  stageHistory: Array<{
    id: string;
    from_stage: Stage | null;
    to_stage: Stage;
    reason: string | null;
    created_at: string;
  }>;
  activities: Array<{
    id: string;
    activity_type: string;
    description: string;
    created_at: string;
  }>;
  recentMessages: MessageItem[];
  conversations: ConversationSummary[];
}

/** Formato devolvido por POST /api/leads/:id/assume. */
export interface AssumeConversationResult {
  lead: LeadRow;
  cancelledFollowups: number;
  summary: string;
}

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  /**
   * Só vira o header `x-tenant-id` quando informado explicitamente aqui. O
   * tenant do caso comum já vem resolvido pelo backend a partir do JWT (via
   * tenant_members) — o header é apenas um seletor opcional para usuários
   * com vínculo ativo em mais de um tenant, e esta etapa ainda não constrói
   * seleção de tenant, então nenhuma chamada abaixo o utiliza hoje.
   */
  tenantId?: string;
}

/** Tenta parsear o corpo como JSON; um corpo vazio/inválido vira `null`. */
async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown, status: number, path: string): string {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return `Erro ${status} ao chamar ${path}.`;
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  if (options.tenantId) {
    headers["x-tenant-id"] = options.tenantId;
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractErrorMessage(payload, response.status, path));
  }

  return payload as T;
}

export async function listLeads(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ leads: LeadRow[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) {
    query.set("limit", String(params.limit));
  }
  if (params?.offset !== undefined) {
    query.set("offset", String(params.offset));
  }
  const querystring = query.toString();

  const response = await apiFetch<{ success: true; leads: LeadRow[]; total: number }>(
    `/api/leads${querystring ? `?${querystring}` : ""}`,
  );

  return { leads: response.leads, total: response.total };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const response = await apiFetch<{ success: true; metrics: DashboardMetrics }>(
    "/api/dashboard/metrics",
  );

  return response.metrics;
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  const response = await apiFetch<{ success: true; subscription: SubscriptionInfo }>(
    "/api/saas/subscription",
  );

  return response.subscription;
}

export async function getLead360(id: string): Promise<Lead360> {
  const response = await apiFetch<{ success: true; data: Lead360 }>(`/api/leads/${id}`);

  return response.data;
}

/**
 * Move o lead para um novo estágio do funil (POST /api/leads/:id/stage).
 * `reason` é omitido do corpo quando não informado — o backend já usa um
 * texto padrão ("Mudança manual de estágio para X") nesse caso.
 */
export async function changeLeadStage(id: string, stage: Stage, reason?: string): Promise<LeadRow> {
  const response = await apiFetch<{ success: true; lead: LeadRow }>(`/api/leads/${id}/stage`, {
    method: "POST",
    body: reason !== undefined ? { stage, reason } : { stage },
  });

  return response.lead;
}

export async function assumeConversation(id: string): Promise<AssumeConversationResult> {
  const response = await apiFetch<{
    success: true;
    lead: LeadRow;
    cancelledFollowups: number;
    summary: string;
  }>(`/api/leads/${id}/assume`, { method: "POST" });

  return {
    lead: response.lead,
    cancelledFollowups: response.cancelledFollowups,
    summary: response.summary,
  };
}

/** Um listing do feed VRSync que não pôde ser importado, com o motivo em pt-BR. */
export interface SkippedListing {
  listingId: string | null;
  reason: string;
}

export interface ImportPropertiesResult {
  importedCount: number;
  /** Ausente na resposta do import-csv (que descarta linha incompleta em silêncio). */
  skippedCount?: number;
  skipped?: SkippedListing[];
}

/** Importação em lote via CSV (POST /api/properties/import-csv). */
export async function importPropertiesCsv(csvContent: string): Promise<ImportPropertiesResult> {
  const response = await apiFetch<{ success: true; importedCount: number }>(
    "/api/properties/import-csv",
    { method: "POST", body: { csvContent } },
  );

  return { importedCount: response.importedCount };
}

/**
 * Importação em lote via VRSync — o XML padrão que ZAP/VivaReal/OLX exigem de
 * toda imobiliária (Etapa 15.2). Diferente do CSV, reporta os listings do
 * feed que não puderam ser importados: é um arquivo de terceiro, não algo que
 * o corretor escreveu à mão, então ele precisa ver por que faltou imóvel.
 */
export async function importPropertiesVrSync(xmlContent: string): Promise<ImportPropertiesResult> {
  const response = await apiFetch<{
    success: true;
    importedCount: number;
    skippedCount: number;
    skipped: SkippedListing[];
  }>("/api/properties/import-vrsync", { method: "POST", body: { xmlContent } });

  return {
    importedCount: response.importedCount,
    skippedCount: response.skippedCount,
    skipped: response.skipped,
  };
}
