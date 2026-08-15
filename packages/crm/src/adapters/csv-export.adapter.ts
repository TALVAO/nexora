import type {
  CRMAdapter,
  CRMSyncMode,
  CRMLeadSyncInput,
  CRMVisitSyncInput,
  CRMActivitySyncInput,
  SyncResult,
} from "../types.js";

export class CsvExportAdapter implements CRMAdapter {
  readonly mode: CRMSyncMode = "CSV_EXPORT";

  formatLeadsToCsv(leads: CRMLeadSyncInput[]): string {
    const headers = [
      "lead_id",
      "name",
      "phone",
      "email",
      "instagram_user_id",
      "stage",
      "score",
      "temperature",
      "transaction_type",
      "property_type",
      "city",
      "neighborhoods",
      "max_budget",
      "bedrooms",
    ];

    const rows = leads.map((l) => [
      l.leadId,
      `"${(l.name || "").replace(/"/g, '""')}"`,
      l.phone || "",
      l.email || "",
      l.instagramUserId || "",
      l.stage,
      l.score,
      l.temperature,
      l.profile?.transactionType || "",
      l.profile?.propertyType || "",
      l.profile?.city || "",
      `"${(l.profile?.neighborhoods || []).join("; ").replace(/"/g, '""')}"`,
      l.profile?.maxBudget || "",
      l.profile?.bedrooms || "",
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  async upsertLead(_tenantId: string, input: CRMLeadSyncInput): Promise<SyncResult> {
    const csv = this.formatLeadsToCsv([input]);
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
      exportData: csv,
    };
  }

  async createActivity(_tenantId: string, input: CRMActivitySyncInput): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
      exportData: `lead_id,activity_type,description\n${input.leadId},${input.activityType},"${input.description.replace(/"/g, '""')}"`,
    };
  }

  async createVisit(_tenantId: string, input: CRMVisitSyncInput): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
      exportData: `visit_id,lead_id,scheduled_at,status\n${input.visitId},${input.leadId},${input.scheduledAt},${input.status}`,
    };
  }

  async updateStage(_tenantId: string, externalLeadId: string, stage: string): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
      exportData: `external_lead_id,stage\n${externalLeadId},${stage}`,
    };
  }
}
