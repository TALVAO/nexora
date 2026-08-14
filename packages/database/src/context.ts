import type { Role } from "@nexora/shared";

export interface TenantContext {
  tenantId: string;
  userId?: string;
  role?: Role;
}

export class TenantSecurityError extends Error {
  constructor(message: string) {
    super(`[TenantSecurityError] ${message}`);
    this.name = "TenantSecurityError";
  }
}

export function assertTenantContext(ctx?: TenantContext): asserts ctx is TenantContext {
  if (!ctx || !ctx.tenantId) {
    throw new TenantSecurityError("Operação bloqueada: tenant_id é obrigatório.");
  }
}
