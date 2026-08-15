import type {
  CRMAdapter,
  CRMSyncMode,
  CRMLeadSyncInput,
  CRMVisitSyncInput,
  CRMActivitySyncInput,
  SyncResult,
} from "../types.js";

export class WebhookCRMAdapter implements CRMAdapter {
  readonly mode: CRMSyncMode = "WEBHOOK";

  constructor(
    private readonly webhookUrl?: string,
    private readonly customHeaders?: Record<string, string>,
  ) {}

  private async dispatchWebhook(
    event: string,
    tenantId: string,
    payload: unknown,
  ): Promise<SyncResult> {
    if (!this.webhookUrl) {
      return {
        success: true,
        mode: this.mode,
        syncedAt: new Date().toISOString(),
      };
    }

    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nexora-Event": event,
          "X-Tenant-ID": tenantId,
          ...(this.customHeaders || {}),
        },
        body: JSON.stringify({
          event,
          tenantId,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          mode: this.mode,
          syncedAt: new Date().toISOString(),
          error: `Webhook retornou status HTTP ${res.status}`,
        };
      }

      return {
        success: true,
        mode: this.mode,
        syncedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      return {
        success: false,
        mode: this.mode,
        syncedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Erro ao disparar webhook para o CRM.",
      };
    }
  }

  async upsertLead(tenantId: string, input: CRMLeadSyncInput): Promise<SyncResult> {
    return this.dispatchWebhook("lead.qualified", tenantId, input);
  }

  async createActivity(tenantId: string, input: CRMActivitySyncInput): Promise<SyncResult> {
    return this.dispatchWebhook("activity.created", tenantId, input);
  }

  async createVisit(tenantId: string, input: CRMVisitSyncInput): Promise<SyncResult> {
    return this.dispatchWebhook("visit.scheduled", tenantId, input);
  }

  async updateStage(tenantId: string, externalLeadId: string, stage: string): Promise<SyncResult> {
    return this.dispatchWebhook("lead.stage_updated", tenantId, {
      externalLeadId,
      stage,
    });
  }
}
