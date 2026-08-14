import { describe, it, expect } from "vitest";
import { assertTenantContext, TenantSecurityError, type TenantContext } from "../context.js";
import { LeadRepository } from "../repositories/lead.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";

describe("Tenant Context Security Assertions", () => {
  it("should throw TenantSecurityError when tenant_id is missing or undefined", () => {
    expect(() => assertTenantContext(undefined)).toThrow(TenantSecurityError);
    expect(() => assertTenantContext({} as TenantContext)).toThrow(TenantSecurityError);
    expect(() => assertTenantContext({ tenantId: "" })).toThrow(TenantSecurityError);
  });

  it("should succeed when tenant_id is properly provided", () => {
    const validCtx: TenantContext = {
      tenantId: "a0000000-0000-0000-0000-000000000001",
      userId: "user-123",
      role: "AGENT",
    };

    expect(() => assertTenantContext(validCtx)).not.toThrow();
  });

  it("should prevent repository operations without tenant context", async () => {
    const leadRepo = new LeadRepository();
    const messageRepo = new MessageRepository();

    await expect(leadRepo.findById({} as TenantContext, "lead-1")).rejects.toThrow(
      TenantSecurityError,
    );

    await expect(messageRepo.findByExternalId({} as TenantContext, "msg-1")).rejects.toThrow(
      TenantSecurityError,
    );
  });
});
