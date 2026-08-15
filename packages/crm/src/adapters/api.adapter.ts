import type {
  CRMAdapter,
  CRMSyncMode,
  CRMLeadSyncInput,
  CRMVisitSyncInput,
  CRMActivitySyncInput,
  SyncResult,
} from "../types.js";

export interface GenericApiConfig {
  apiUrl?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  maxRetries?: number;
}

export class GenericApiCRMAdapter implements CRMAdapter {
  readonly mode: CRMSyncMode = "API";

  constructor(private readonly config?: GenericApiConfig) {}

  private async requestWithRetry(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH",
    body: unknown,
    tenantId: string,
  ): Promise<SyncResult> {
    if (!this.config?.apiUrl) {
      // Modo simulação para testes
      return {
        success: true,
        mode: this.mode,
        externalCrmId: `crm_ext_${Date.now()}`,
        syncedAt: new Date().toISOString(),
      };
    }

    const maxRetries = this.config.maxRetries || 2;
    let lastError = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.config.apiUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: this.config.apiKey ? `Bearer ${this.config.apiKey}` : "",
            "X-Tenant-ID": tenantId,
            ...(this.config.customHeaders || {}),
          },
          body: JSON.stringify(body),
        });

        const data = (await response.json()) as { id?: string; error?: string };

        if (!response.ok) {
          lastError = data.error || `HTTP ${response.status}`;
          continue;
        }

        return {
          success: true,
          mode: this.mode,
          externalCrmId: data.id || `crm_${Date.now()}`,
          syncedAt: new Date().toISOString(),
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : "Erro na chamada HTTP do CRM";
      }
    }

    return {
      success: false,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
      error: `Falha após ${maxRetries + 1} tentativas: ${lastError}`,
    };
  }

  async upsertLead(tenantId: string, input: CRMLeadSyncInput): Promise<SyncResult> {
    return this.requestWithRetry("leads", "POST", input, tenantId);
  }

  async createActivity(tenantId: string, input: CRMActivitySyncInput): Promise<SyncResult> {
    return this.requestWithRetry(`leads/${input.leadId}/activities`, "POST", input, tenantId);
  }

  async createVisit(tenantId: string, input: CRMVisitSyncInput): Promise<SyncResult> {
    return this.requestWithRetry(`visits`, "POST", input, tenantId);
  }

  async updateStage(tenantId: string, externalLeadId: string, stage: string): Promise<SyncResult> {
    return this.requestWithRetry(`leads/${externalLeadId}/stage`, "PATCH", { stage }, tenantId);
  }
}
