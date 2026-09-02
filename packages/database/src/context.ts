import type { Role } from "@nexora/shared";
import type pg from "pg";
import { getDatabasePool, runInTenantSession } from "./client.js";

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

/**
 * Role de aplicação assumida durante consultas de negócio. Criada pela migration
 * `20260822000003_rls_app_role.sql` sem BYPASSRLS e sem DDL.
 */
const DEFAULT_APP_ROLE = "nexora_app";

/** Identificadores SQL não podem ser parametrizados — daí a validação estrita. */
const SAFE_ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

function resolveAppRole(): string {
  const role = process.env.DATABASE_APP_ROLE || DEFAULT_APP_ROLE;
  if (!SAFE_ROLE_NAME.test(role)) {
    throw new TenantSecurityError(
      `DATABASE_APP_ROLE inválido: "${role}". Use apenas letras minúsculas, dígitos e underscore.`,
    );
  }
  return role;
}

/**
 * Executa `fn` dentro de uma transação com o tenant fixado na sessão do banco
 * e o privilégio da conexão rebaixado para a role de aplicação.
 *
 * A partir daí o isolamento deixa de depender de o SQL lembrar do
 * `WHERE tenant_id`: a policy de RLS recusa a linha de outro tenant mesmo que
 * a consulta peça por ela (CLAUDE.md §11).
 *
 * Não existe modo silencioso de desligar isto. Se a role não existir, a
 * requisição falha com erro explícito em vez de rodar sem proteção.
 */
export async function withTenantTransaction<T>(
  ctx: TenantContext,
  fn: () => Promise<T>,
  pool?: pg.Pool,
): Promise<T> {
  assertTenantContext(ctx);

  const appRole = resolveAppRole();
  const client = await (pool || getDatabasePool()).connect();

  try {
    await client.query("BEGIN;");

    // set_config(..., is_local = true) vale só até o fim da transação.
    await client.query("SELECT set_config('app.current_tenant_id', $1, true);", [ctx.tenantId]);
    if (ctx.userId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true);", [ctx.userId]);
    }

    try {
      await client.query(`SET LOCAL ROLE ${appRole};`);
    } catch (err) {
      throw new TenantSecurityError(
        `Não foi possível assumir a role "${appRole}". Aplique a migration ` +
          `20260822000003_rls_app_role.sql antes de servir tráfego. Causa: ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }

    const afterCommit: Array<() => void> = [];
    const result = await runInTenantSession({ client, tenantId: ctx.tenantId, afterCommit }, fn);

    await client.query("COMMIT;");

    for (const callback of afterCommit) {
      try {
        callback();
      } catch (err) {
        // Efeito colateral pós-commit não pode desfazer a transação já gravada.
        console.error("[DB] Callback pós-COMMIT falhou:", err);
      }
    }

    return result;
  } catch (err) {
    await client.query("ROLLBACK;").catch((rollbackErr) => {
      // Não engolir: perder o rollback muda o estado do banco.
      console.error("[DB] Falha ao reverter transação de tenant:", rollbackErr);
    });
    throw err;
  } finally {
    client.release();
  }
}
