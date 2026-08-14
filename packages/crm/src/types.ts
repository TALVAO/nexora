export type CRMSyncMode = "NO_SYNC" | "CSV_EXPORT" | "WEBHOOK" | "API";

export interface SyncResult {
  success: boolean;
  externalCrmId?: string;
  syncedAt: string;
  error?: string;
}

export interface CRMAdapter {
  upsertLead(tenantId: string, leadData: Record<string, unknown>): Promise<SyncResult>;
  createActivity(tenantId: string, activityData: Record<string, unknown>): Promise<SyncResult>;
  createVisit(tenantId: string, visitData: Record<string, unknown>): Promise<SyncResult>;
  updateStage(tenantId: string, externalLeadId: string, stage: string): Promise<SyncResult>;
}
