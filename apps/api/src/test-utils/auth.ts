import type { FastifyInstance } from "fastify";
import { TenantRepository } from "@nexora/database";
import type { Role } from "@nexora/shared";

export const TEST_TENANT_ID = "a0000000-0000-0000-0000-000000000001";
export const TEST_FOREIGN_TENANT_ID = "b0000000-0000-0000-0000-000000000002";
export const TEST_AUTH_USER_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_PROFILE_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_FOREIGN_AUTH_USER_ID = "33333333-3333-3333-3333-333333333333";

/**
 * TenantRepository de teste: reconhece APENAS TEST_AUTH_USER_ID como membro
 * ativo de TEST_TENANT_ID. Qualquer outra combinação devolve null.
 *
 * É essa restrição que dá valor ao teste de invasão: um token válido apontando
 * para um tenant do qual o usuário não é membro precisa ser recusado.
 */
export function createAuthTestTenantRepo(
  repo?: TenantRepository,
  role: Role = "OWNER",
): TenantRepository {
  const tenantRepo = repo ?? new TenantRepository();

  tenantRepo.resolveMembership = async (authUserId, requestedTenantId) => {
    if (authUserId !== TEST_AUTH_USER_ID) return null;
    if (requestedTenantId && requestedTenantId !== TEST_TENANT_ID) return null;
    return {
      profileId: TEST_PROFILE_ID,
      tenantId: TEST_TENANT_ID,
      role,
    };
  };

  return tenantRepo;
}

export function signTestToken(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): string {
  return app.jwt.sign(
    {
      sub: TEST_AUTH_USER_ID,
      email: "corretor@teste.com",
      aud: "authenticated",
      ...overrides,
    },
    { expiresIn: "1h" },
  );
}

/** Headers autenticados padrão dos testes de rota. */
export function authHeaders(
  app: FastifyInstance,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    authorization: `Bearer ${signTestToken(app)}`,
    "x-tenant-id": TEST_TENANT_ID,
    ...extra,
  };
}
