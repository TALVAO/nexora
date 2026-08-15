import type {
  CRMAdapter,
  CRMSyncMode,
  CRMLeadSyncInput,
  CRMVisitSyncInput,
  CRMActivitySyncInput,
  SyncResult,
} from "../types.js";

export class NoSyncAdapter implements CRMAdapter {
  readonly mode: CRMSyncMode = "NO_SYNC";

  async upsertLead(_tenantId: string, _input: CRMLeadSyncInput): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
    };
  }

  async createActivity(_tenantId: string, _input: CRMActivitySyncInput): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
    };
  }

  async createVisit(_tenantId: string, _input: CRMVisitSyncInput): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
    };
  }

  async updateStage(
    _tenantId: string,
    _externalLeadId: string,
    _stage: string,
  ): Promise<SyncResult> {
    return {
      success: true,
      mode: this.mode,
      syncedAt: new Date().toISOString(),
    };
  }
}
