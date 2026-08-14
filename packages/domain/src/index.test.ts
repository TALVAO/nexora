import { describe, it, expect } from "vitest";
import type { Tenant, LeadEntity } from "./index.js";

describe("@nexora/domain", () => {
  it("should define valid Domain contracts", () => {
    const sampleTenant: Tenant = {
      id: "tenant-1",
      tenantId: "tenant-1",
      name: "Imobiliária Prime",
      slug: "imobiliaria-prime",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const sampleLead: LeadEntity = {
      id: "lead-1",
      tenantId: sampleTenant.tenantId,
      stage: "NEW",
      automationMode: "AI",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(sampleTenant.name).toBe("Imobiliária Prime");
    expect(sampleLead.stage).toBe("NEW");
    expect(sampleLead.automationMode).toBe("AI");
  });
});
