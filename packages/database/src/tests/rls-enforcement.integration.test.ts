import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { withTenantTransaction } from "../context.js";
import { query } from "../client.js";
import { LeadRepository } from "../repositories/lead.repository.js";

/**
 * Teste de integração do isolamento multi-tenant no BANCO (CLAUDE.md §11).
 *
 * Diferente de `rls-isolation.test.ts`, que apenas inspeciona a string SQL com
 * um dublê, este teste conecta num PostgreSQL real e prova que a proteção
 * existe mesmo quando a consulta NÃO filtra por tenant.
 *
 * Requer um banco com as migrations aplicadas:
 *   npm run db:test:up
 *
 * Sem banco alcançável, a suíte é pulada com aviso — nunca falsamente verde.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

const TENANT_A = "aaaaaaaa-1111-1111-1111-111111111111";
const TENANT_B = "bbbbbbbb-2222-2222-2222-222222222222";

async function probeDatabase(): Promise<{ ready: boolean; reason: string }> {
  const probe = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const tables = await probe.query(
      "SELECT to_regclass('public.leads') AS leads, to_regclass('public.tenants') AS tenants;",
    );
    if (!tables.rows[0]?.leads || !tables.rows[0]?.tenants) {
      return { ready: false, reason: "schema não aplicado (migrations 01/03/02 faltando)" };
    }

    const role = await probe.query("SELECT 1 FROM pg_roles WHERE rolname = 'nexora_app';");
    if (role.rowCount === 0) {
      return { ready: false, reason: "role nexora_app ausente (migration 03 não aplicada)" };
    }

    return { ready: true, reason: "" };
  } catch (err) {
    // Falha de conexão costuma vir como AggregateError com message vazia;
    // sem detalhe, o aviso de skip não ajuda ninguém a diagnosticar.
    const detail =
      err instanceof AggregateError
        ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ")
        : err instanceof Error
          ? err.message
          : String(err);
    return { ready: false, reason: detail || `banco inacessível em ${TEST_DATABASE_URL}` };
  } finally {
    await probe.end();
  }
}

const probeResult = await probeDatabase();

if (!probeResult.ready) {
  console.warn(
    `[RLS] Suíte de integração PULADA — ${probeResult.reason}. ` +
      `Rode 'npm run db:test:up' para exercer o isolamento de verdade.`,
  );
}

describe.skipIf(!probeResult.ready)("RLS: isolamento no banco (Etapa 13.2)", () => {
  let pool: pg.Pool;
  let leadA: string;
  let leadB: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    // Semeadura como usuário privilegiado, fora de qualquer sessão de tenant.
    await pool.query("DELETE FROM leads WHERE tenant_id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Imobiliaria A', 'rls-imob-a'), ($2, 'Imobiliaria B', 'rls-imob-b');`,
      [TENANT_A, TENANT_B],
    );

    const inserted = await pool.query(
      `INSERT INTO leads (tenant_id, name, phone, source)
       VALUES ($1, 'Lead do A', '5511900000001', 'WHATSAPP'),
              ($2, 'Lead do B', '5511900000002', 'WHATSAPP')
       RETURNING id, tenant_id;`,
      [TENANT_A, TENANT_B],
    );
    leadA = inserted.rows.find((r) => r.tenant_id === TENANT_A)!.id;
    leadB = inserted.rows.find((r) => r.tenant_id === TENANT_B)!.id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM leads WHERE tenant_id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.end();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  it("TESTE CRÍTICO: consulta SEM filtro de tenant devolve apenas o tenant da sessão", async () => {
    const rows = await withTenantTransaction(
      { tenantId: TENANT_A },
      async () => {
        // Deliberadamente sem WHERE tenant_id. Se a proteção dependesse do SQL,
        // este SELECT vazaria a base inteira.
        const result = await query<{ name: string; tenant_id: string }>(
          "SELECT name, tenant_id FROM leads;",
        );
        return result.rows;
      },
      pool,
    );

    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("Lead do A");
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it("não devolve linha do Tenant B nem quando o SQL pede por ela explicitamente", async () => {
    const rows = await withTenantTransaction(
      { tenantId: TENANT_A },
      async () => {
        const result = await query("SELECT id FROM leads WHERE tenant_id = $1;", [TENANT_B]);
        return result.rows;
      },
      pool,
    );

    expect(rows.length).toBe(0);
  });

  it("bloqueia UPDATE cross-tenant", async () => {
    const affected = await withTenantTransaction(
      { tenantId: TENANT_A },
      async () => {
        const result = await query("UPDATE leads SET name = 'INVADIDO' WHERE id = $1;", [leadB]);
        return result.rowCount;
      },
      pool,
    );

    expect(affected).toBe(0);

    // Confirma pelo caminho privilegiado que o dado do B seguiu intacto.
    const check = await pool.query("SELECT name FROM leads WHERE id = $1;", [leadB]);
    expect(check.rows[0]?.name).toBe("Lead do B");
  });

  it("bloqueia DELETE cross-tenant", async () => {
    const affected = await withTenantTransaction(
      { tenantId: TENANT_A },
      async () => {
        const result = await query("DELETE FROM leads WHERE id = $1;", [leadB]);
        return result.rowCount;
      },
      pool,
    );

    expect(affected).toBe(0);
    const check = await pool.query("SELECT count(*)::int AS n FROM leads WHERE id = $1;", [leadB]);
    expect(check.rows[0]?.n).toBe(1);
  });

  it("bloqueia INSERT marcado com o tenant alheio (WITH CHECK)", async () => {
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A },
        async () => {
          await query(
            "INSERT INTO leads (tenant_id, name, source) VALUES ($1, 'Injetado', 'WHATSAPP');",
            [TENANT_B],
          );
        },
        pool,
      ),
    ).rejects.toThrow(/row-level security/i);

    const check = await pool.query("SELECT count(*)::int AS n FROM leads WHERE tenant_id = $1;", [
      TENANT_B,
    ]);
    expect(check.rows[0]?.n).toBe(1);
  });

  it("o repositório enxerga o próprio lead e não enxerga o do outro tenant", async () => {
    const repo = new LeadRepository();

    const own = await withTenantTransaction(
      { tenantId: TENANT_A },
      () => repo.findById({ tenantId: TENANT_A }, leadA),
      pool,
    );
    expect(own?.name).toBe("Lead do A");

    const foreign = await withTenantTransaction(
      { tenantId: TENANT_A },
      () => repo.findById({ tenantId: TENANT_A }, leadB),
      pool,
    );
    expect(foreign).toBeNull();
  });

  it("reverte a transação inteira quando o callback falha", async () => {
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A },
        async () => {
          await query("UPDATE leads SET name = 'Renomeado' WHERE id = $1;", [leadA]);
          throw new Error("falha proposital no meio da operação");
        },
        pool,
      ),
    ).rejects.toThrow("falha proposital");

    const check = await pool.query("SELECT name FROM leads WHERE id = $1;", [leadA]);
    expect(check.rows[0]?.name).toBe("Lead do A");
  });

  it("devolve a conexão ao pool mesmo após erro", async () => {
    const before = pool.idleCount + pool.totalCount;

    for (let i = 0; i < 5; i++) {
      await withTenantTransaction(
        { tenantId: TENANT_A },
        async () => {
          throw new Error("erro repetido");
        },
        pool,
      ).catch(() => undefined);
    }

    expect(pool.totalCount).toBeLessThanOrEqual(before + 1);
    expect(pool.waitingCount).toBe(0);
  });
});
