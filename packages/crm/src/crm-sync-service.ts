import type {
  CRMAdapter,
  TenantCRMConfig,
  CRMLeadSyncInput,
  CRMVisitSyncInput,
  CRMActivitySyncInput,
  SyncResult,
} from "./types.js";
import { NoSyncAdapter } from "./adapters/no-sync.adapter.js";
import { CsvExportAdapter } from "./adapters/csv-export.adapter.js";
import { WebhookCRMAdapter } from "./adapters/webhook.adapter.js";
import { GenericApiCRMAdapter } from "./adapters/api.adapter.js";

export class CRMSyncService {
  private readonly adapterMap = new Map<string, CRMAdapter>();
  private readonly configMap = new Map<string, TenantCRMConfig>();

  constructor(defaultConfigs?: TenantCRMConfig[]) {
    if (defaultConfigs) {
      for (const cfg of defaultConfigs) {
        this.setConfig(cfg);
      }
    }
  }

  setConfig(config: TenantCRMConfig): void {
    this.configMap.set(config.tenantId, config);

    let adapter: CRMAdapter;
    switch (config.mode) {
      case "CSV_EXPORT":
        adapter = new CsvExportAdapter();
        break;
      case "WEBHOOK":
        adapter = new WebhookCRMAdapter(config.webhookUrl || undefined, config.customHeaders);
        break;
      case "API":
        adapter = new GenericApiCRMAdapter({
          apiUrl: config.apiUrl || undefined,
          apiKey: config.apiKey || undefined,
          customHeaders: config.customHeaders,
        });
        break;
      case "NO_SYNC":
      default:
        adapter = new NoSyncAdapter();
        break;
    }

    this.adapterMap.set(config.tenantId, adapter);
  }

  getConfig(tenantId: string): TenantCRMConfig {
    return (
      this.configMap.get(tenantId) || {
        tenantId,
        mode: "NO_SYNC",
        isEnabled: false,
      }
    );
  }

  getAdapter(tenantId: string): CRMAdapter {
    return this.adapterMap.get(tenantId) || new NoSyncAdapter();
  }

  /**
   * Sincroniza um lead qualificado seletivamente (Regra Seção 64: não sincronizar tudo sem necessidade).
   */
  async syncQualifiedLead(tenantId: string, input: CRMLeadSyncInput): Promise<SyncResult> {
    const cfg = this.getConfig(tenantId);
    if (!cfg.isEnabled && cfg.mode !== "CSV_EXPORT") {
      return {
        success: true,
        mode: "NO_SYNC",
        syncedAt: new Date().toISOString(),
      };
    }

    const adapter = this.getAdapter(tenantId);
    return adapter.upsertLead(tenantId, input);
  }

  /**
   * Sincroniza agendamento ou conclusão de visita.
   */
  async syncVisit(tenantId: string, input: CRMVisitSyncInput): Promise<SyncResult> {
    const cfg = this.getConfig(tenantId);
    if (!cfg.isEnabled && cfg.mode !== "CSV_EXPORT") {
      return {
        success: true,
        mode: "NO_SYNC",
        syncedAt: new Date().toISOString(),
      };
    }

    const adapter = this.getAdapter(tenantId);
    return adapter.createVisit(tenantId, input);
  }

  /**
   * Sincroniza atualização de etapa comercial.
   */
  async syncStageUpdate(
    tenantId: string,
    externalLeadId: string,
    stage: string,
  ): Promise<SyncResult> {
    const cfg = this.getConfig(tenantId);
    if (!cfg.isEnabled && cfg.mode !== "CSV_EXPORT") {
      return {
        success: true,
        mode: "NO_SYNC",
        syncedAt: new Date().toISOString(),
      };
    }

    const adapter = this.getAdapter(tenantId);
    return adapter.updateStage(tenantId, externalLeadId, stage);
  }

  /**
   * Sincroniza resumo/nota de atendimento.
   */
  async syncActivityNote(tenantId: string, input: CRMActivitySyncInput): Promise<SyncResult> {
    const cfg = this.getConfig(tenantId);
    if (!cfg.isEnabled && cfg.mode !== "CSV_EXPORT") {
      return {
        success: true,
        mode: "NO_SYNC",
        syncedAt: new Date().toISOString(),
      };
    }

    const adapter = this.getAdapter(tenantId);
    return adapter.createActivity(tenantId, input);
  }

  /**
   * Gera exportação em massa de CSV para o CRM legado.
   */
  exportLeadsToCsv(leads: CRMLeadSyncInput[]): string {
    const csvAdapter = new CsvExportAdapter();
    return csvAdapter.formatLeadsToCsv(leads);
  }
}
