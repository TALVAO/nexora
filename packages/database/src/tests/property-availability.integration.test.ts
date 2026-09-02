import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { PropertyRepository } from "../repositories/property.repository.js";
import { closeDatabasePool } from "../client.js";

/**
 * Procedência da disponibilidade contra Postgres real (Etapa 15.1).
 *
 * Existe por um motivo específico: nas Etapas 13.3, 14.2 e 14.3 três bugs de
 * SQL passaram por todos os testes porque os testes unitários dublavam
 * `query()` — o INSERT só quebrava contra o banco de verdade. Colunas novas
 * são exatamente o terreno onde isso acontece de novo.
 *
 * Requer: npm run db:test:up
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

process.env.DATABASE_URL = TEST_DATABASE_URL;

const TENANT = "eeeeeeee-4444-4444-4444-444444444444";

async function probe(): Promise<boolean> {
  const p = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const r = await p.query(
      `SELECT
         to_regclass('public.properties') AS properties,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'properties' AND column_name = 'availability_verified_at'
         ) AS has_column;`,
    );
    return Boolean(r.rows[0]?.properties) && Boolean(r.rows[0]?.has_column);
  } catch {
    return false;
  } finally {
    await p.end();
  }
}

const ready = await probe();
if (!ready) {
  console.warn("[Disponibilidade] Suíte de integração PULADA — rode 'npm run db:test:up'.");
}

describe.skipIf(!ready)("Procedência da disponibilidade (Etapa 15.1)", () => {
  let pool: pg.Pool;
  const repo = new PropertyRepository();

  beforeAll(async () => {
    await closeDatabasePool();
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    await pool.query("DELETE FROM properties WHERE tenant_id = $1;", [TENANT]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [TENANT]);
    await pool.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Imobiliaria Disponibilidade', 'disp-a');`,
      [TENANT],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM properties WHERE tenant_id = $1;", [TENANT]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [TENANT]);
    await pool.end();
    await closeDatabasePool();
  });

  it("o tenant nasce com a janela padrão de 24h / 7 dias", async () => {
    const result = await pool.query<{
      availability_fresh_hours: number;
      availability_stale_hours: number;
    }>(
      `SELECT availability_fresh_hours, availability_stale_hours FROM tenants WHERE id = $1;`,
      [TENANT],
    );

    expect(result.rows[0]?.availability_fresh_hours).toBe(24);
    expect(result.rows[0]?.availability_stale_hours).toBe(168);
  });

  it("recusa janela invertida (fresco maior que vencido)", async () => {
    await expect(
      pool.query(`UPDATE tenants SET availability_stale_hours = 1 WHERE id = $1;`, [TENANT]),
    ).rejects.toThrow(/chk_tenant_availability_window/);
  });

  it("cadastrar imóvel carimba a verificação e a origem padrão", async () => {
    const property = await repo.create(
      { tenantId: TENANT },
      { title: "Apto teste 15.1", transactionType: "RENT", city: "Recife", price: 2500 },
    );

    expect(property.availability_source).toBe("MANUAL");
    expect(property.availability_verified_at).not.toBeNull();

    // O carimbo é de agora, não uma data qualquer.
    const idadeMs = Date.now() - new Date(property.availability_verified_at!).getTime();
    expect(idadeMs).toBeLessThan(60_000);
  });

  it("respeita a origem informada por quem cadastrou", async () => {
    const property = await repo.create(
      { tenantId: TENANT },
      {
        title: "Apto vindo de feed",
        transactionType: "RENT",
        city: "Recife",
        price: 2100,
        availabilitySource: "XML_FEED",
      },
    );

    expect(property.availability_source).toBe("XML_FEED");
  });

  it("TESTE CRÍTICO: mudar o status recarimba a verificação e a origem", async () => {
    const property = await repo.create(
      { tenantId: TENANT },
      { title: "Apto que muda de status", transactionType: "RENT", city: "Recife", price: 1900 },
    );

    // Envelhece o carimbo à força: é o estado que a Etapa 15.1 existe para
    // detectar — imóvel "AVAILABLE" com verificação vencida.
    await pool.query(
      `UPDATE properties SET availability_verified_at = now() - interval '30 days' WHERE id = $1;`,
      [property.id],
    );

    const updated = await repo.update({ tenantId: TENANT }, property.id, {
      status: "RENTED",
      availabilitySource: "AGENT_CONFIRMED",
    });

    expect(updated?.status).toBe("RENTED");
    expect(updated?.availability_source).toBe("AGENT_CONFIRMED");

    const idadeMs = Date.now() - new Date(updated!.availability_verified_at!).getTime();
    expect(idadeMs).toBeLessThan(60_000);
  });

  it("update sem status não mexe no carimbo de disponibilidade", async () => {
    const property = await repo.create(
      { tenantId: TENANT },
      { title: "Apto que só muda de preço", transactionType: "RENT", city: "Recife", price: 1700 },
    );

    await pool.query(
      `UPDATE properties SET availability_verified_at = now() - interval '10 days' WHERE id = $1;`,
      [property.id],
    );

    const updated = await repo.update({ tenantId: TENANT }, property.id, { price: 1750 });

    // Corrigir o preço não é conferir se o imóvel ainda está livre.
    const idadeHoras =
      (Date.now() - new Date(updated!.availability_verified_at!).getTime()) / 3_600_000;
    expect(idadeHoras).toBeGreaterThan(200);
  });
});
