import { describe, it, expect } from "vitest";
import type { SyncResult } from "./types.js";

describe("@nexora/crm", () => {
  it("should define valid SyncResult contract", () => {
    const result: SyncResult = {
      success: true,
      externalCrmId: "crm_lead_99",
      syncedAt: new Date().toISOString(),
    };

    expect(result.success).toBe(true);
    expect(result.externalCrmId).toBe("crm_lead_99");
  });
});
