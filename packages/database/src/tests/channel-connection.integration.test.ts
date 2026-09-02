import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { ChannelConnectionRepository } from "../repositories/channel-connection.repository.js";
import { closeDatabasePool } from "../client.js";

/**
 * Resolução de tenant pela conexão de canal (Etapa 13.4).
 *
 * É o que substituiu o `x-tenant-id` que o webhook aceitava do cliente.
 *
 * Requer: npm run db:test:up
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

// `resolveByExternalAccount` usa o pool global: é a consulta que DESCOBRE o
// tenant, então não roda dentro de sessão de tenant.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const TENANT_A = "a1a1a1a1-7777-7777-7777-777777777777";
const TENANT_B = "b2b2b2b2-8888-8888-8888-888888888888";

async function probe(): Promise<boolean> {
  const p = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const r = await p.query("SELECT to_regclass('public.channel_connections') AS t;");
    return Boolean(r.rows[0]?.t);
  } catch {
    return false;
  } finally {
    await p.end();
  }
}

const ready = await probe();
if (!ready) {
  console.warn("[Canal] Suíte de integração PULADA — rode 'npm run db:test:up'.");
}

describe.skipIf(!ready)("Resolução de tenant pela conexão de canal (Etapa 13.4)", () => {
  let pool: pg.Pool;
  const repo = new ChannelConnectionRepository();

  beforeAll(async () => {
    // Força o pool global a nascer apontando para o banco de teste.
    await closeDatabasePool();
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    await pool.query("DELETE FROM channel_connections WHERE tenant_id IN ($1, $2);", [
      TENANT_A,
      TENANT_B,
    ]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query(
      `INSERT INTO tenants (id, name, slug) VALUES
         ($1, 'Imobiliaria A', 'canal-a'),
         ($2, 'Imobiliaria B', 'canal-b');`,
      [TENANT_A, TENANT_B],
    );

    await pool.query(
      `INSERT INTO channel_connections
         (tenant_id, channel, provider, external_account_id, status, settings_json)
       VALUES
         ($1, 'WHATSAPP', 'evolution', 'instancia-do-a', 'CONNECTED', '{"webhook_secret":"segredo-do-a"}'::jsonb),
         ($2, 'WHATSAPP', 'evolution', 'instancia-do-b', 'CONNECTED', '{}'::jsonb),
         ($1, 'INSTAGRAM', 'instagram_graph', 'ig-conta-do-a', 'CONNECTED', '{}'::jsonb);`,
      [TENANT_A, TENANT_B],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM channel_connections WHERE tenant_id IN ($1, $2);", [
      TENANT_A,
      TENANT_B,
    ]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.end();
    await closeDatabasePool();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  it("TESTE CRÍTICO: cada instância resolve para o tenant dono dela", async () => {
    const a = await repo.resolveByExternalAccount("WHATSAPP", "evolution", "instancia-do-a");
    const b = await repo.resolveByExternalAccount("WHATSAPP", "evolution", "instancia-do-b");

    expect(a?.tenantId).toBe(TENANT_A);
    expect(b?.tenantId).toBe(TENANT_B);
  });

  it("conta não cadastrada não resolve para tenant nenhum", async () => {
    const resultado = await repo.resolveByExternalAccount(
      "WHATSAPP",
      "evolution",
      "instancia-que-nao-existe",
    );
    expect(resultado).toBeNull();
  });

  it("o canal faz parte da chave: mesma conta em canal diferente não resolve", async () => {
    const resultado = await repo.resolveByExternalAccount(
      "INSTAGRAM",
      "instagram_graph",
      "instancia-do-a",
    );
    expect(resultado).toBeNull();
  });

  it("lê o segredo próprio da conexão quando existe", async () => {
    const a = await repo.resolveByExternalAccount("WHATSAPP", "evolution", "instancia-do-a");
    expect(a?.webhookSecret).toBe("segredo-do-a");

    const b = await repo.resolveByExternalAccount("WHATSAPP", "evolution", "instancia-do-b");
    expect(b?.webhookSecret).toBeNull();
  });

  it("provider é comparado sem diferenciar caixa", async () => {
    const a = await repo.resolveByExternalAccount("WHATSAPP", "EVOLUTION", "instancia-do-a");
    expect(a?.tenantId).toBe(TENANT_A);
  });

  it("conta duplicada em dois tenants é RECUSADA, não escolhida no chute", async () => {
    // Cenário real: alguém cadastra a mesma instância em duas contas. Escolher
    // uma entregaria metade das mensagens ao tenant errado.
    await pool.query(
      `INSERT INTO channel_connections
         (tenant_id, channel, provider, external_account_id, status)
       VALUES ($1, 'WHATSAPP', 'evolution', 'instancia-disputada', 'CONNECTED'),
              ($2, 'WHATSAPP', 'evolution', 'instancia-disputada', 'CONNECTED');`,
      [TENANT_A, TENANT_B],
    );

    const resultado = await repo.resolveByExternalAccount(
      "WHATSAPP",
      "evolution",
      "instancia-disputada",
    );
    expect(resultado).toBeNull();
  });

  it("id vazio não resolve", async () => {
    expect(await repo.resolveByExternalAccount("WHATSAPP", "evolution", "   ")).toBeNull();
  });
});
