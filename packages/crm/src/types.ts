export type CRMSyncMode = "NO_SYNC" | "CSV_EXPORT" | "WEBHOOK" | "API";

export interface SyncResult {
  success: boolean;
  mode: CRMSyncMode;
  externalCrmId?: string;
  syncedAt: string;
  error?: string;
  exportData?: string;
}

export interface CRMLeadSyncInput {
  leadId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  instagramUserId?: string | null;
  stage: string;
  score: number;
  temperature: string;
  profile?: {
    transactionType?: string | null;
    propertyType?: string | null;
    city?: string | null;
    neighborhoods?: string[];
    maxBudget?: number | null;
    bedrooms?: number | null;
  } | null;
  lastSummary?: string | null;
}

export interface CRMVisitSyncInput {
  visitId: string;
  leadId: string;
  externalLeadId?: string | null;
  propertyId?: string | null;
  scheduledAt: string;
  status: string;
  feedback?: string | null;
}

export interface CRMActivitySyncInput {
  leadId: string;
  externalLeadId?: string | null;
  activityType: string;
  description: string;
}

export interface CRMAdapter {
  readonly mode: CRMSyncMode;
  upsertLead(tenantId: string, input: CRMLeadSyncInput): Promise<SyncResult>;
  createActivity(tenantId: string, input: CRMActivitySyncInput): Promise<SyncResult>;
  createVisit(tenantId: string, input: CRMVisitSyncInput): Promise<SyncResult>;
  updateStage(tenantId: string, externalLeadId: string, stage: string): Promise<SyncResult>;
}

export interface TenantCRMConfig {
  tenantId: string;
  mode: CRMSyncMode;
  isEnabled: boolean;
  apiUrl?: string | null;
  apiKey?: string | null;
  webhookUrl?: string | null;
  customHeaders?: Record<string, string>;
}
