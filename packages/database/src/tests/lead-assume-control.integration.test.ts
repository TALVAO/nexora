import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { LeadRepository } from "../repositories/lead.repository.js";
import { closeDatabasePool } from "../client.js";

/**
 * "Assumir conversa" no inbox unificado (Etapa 14.2).
 *
 * O corretor tira a IA do atendimento de um lead. Isso precisa alcançar TODAS
 * as conversas do lead (WhatsApp e Instagram ao mesmo tempo) — se uma
 * conversa ficasse esquecida em automation_mode = 'AI', a IA continuaria
 * respondendo automaticamente naquele canal, violando o human takeover do
 * CLAUDE.md §24.
 *
 * Requer: npm run db:test:up
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

process.env.DATABASE_URL = TEST_DATABASE_URL;

const TENANT_A = "cccccccc-1111-1111-1111-111111111111";
const TENANT_B = "dddddddd-2222-2222-2222-222222222222";

async function probe(): Promise<boolean> {
  const p = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const r = await p.query(
      "SELECT to_regclass('public.leads') AS leads, to_regclass('public.conversations') AS conversations;",
    );
    return Boolean(r.rows[0]?.leads) && Boolean(r.rows[0]?.conversations);
  } catch {
    return false;
  } finally {
    await p.end();
  }
}

const ready = await probe();
if (!ready) {
  console.warn("[Assumir conversa] Suíte de integração PULADA — rode 'npm run db:test:up'.");
}

describe.skipIf(!ready)("LeadRepository.assumeControl — human takeover (Etapa 14.2)", () => {
  let pool: pg.Pool;
  const repo = new LeadRepository();

  let leadComConversas: string;
  let leadSemConversa: string;
  let leadDoTenantB: string;

  beforeAll(async () => {
    await closeDatabasePool();
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    await pool.query("DELETE FROM leads WHERE tenant_id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query(
      `INSERT INTO tenants (id, name, slug) VALUES
         ($1, 'Imobiliaria A', 'assumir-a'),
         ($2, 'Imobiliaria B', 'assumir-b');`,
      [TENANT_A, TENANT_B],
    );

    const leadsInserted = await pool.query(
      `INSERT INTO leads (tenant_id, name, phone, source, automation_mode)
       VALUES
         ($1, 'Lead com dois canais', '5511900000001', 'WHATSAPP', 'AI'),
         ($1, 'Lead sem conversa ainda', '5511900000002', 'WHATSAPP', 'AI'),
         ($2, 'Lead do outro tenant', '5511900000003', 'WHATSAPP', 'AI')
       RETURNING id, name;`,
      [TENANT_A, TENANT_B],
    );
    leadComConversas = leadsInserted.rows.find((r) => r.name === "Lead com dois canais")!.id;
    leadSemConversa = leadsInserted.rows.find((r) => r.name === "Lead sem conversa ainda")!.id;
    leadDoTenantB = leadsInserted.rows.find((r) => r.name === "Lead do outro tenant")!.id;

    await pool.query(
      `INSERT INTO conversations (tenant_id, lead_id, channel, provider, automation_mode)
       VALUES
         ($1, $2, 'WHATSAPP', 'evolution', 'AI'),
         ($1, $2, 'INSTAGRAM', 'instagram_graph', 'AI');`,
      [TENANT_A, leadComConversas],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM leads WHERE tenant_id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_A, TENANT_B]);
    await pool.end();
    await closeDatabasePool();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  it("TESTE CRÍTICO: derruba automation_mode do lead E de todas as conversas (WhatsApp e Instagram)", async () => {
    const updated = await repo.assumeControl({ tenantId: TENANT_A }, leadComConversas);

    expect(updated?.automation_mode).toBe("HUMAN");

    const conversas = await pool.query<{ channel: string; automation_mode: string }>(
      `SELECT channel, automation_mode FROM conversations WHERE lead_id = $1 ORDER BY channel;`,
      [leadComConversas],
    );

    expect(conversas.rows).toHaveLength(2);
    expect(conversas.rows.every((r) => r.automation_mode === "HUMAN")).toBe(true);
  });

  it("lead sem nenhuma conversa ainda não falha ao assumir", async () => {
    const updated = await repo.assumeControl({ tenantId: TENANT_A }, leadSemConversa);
    expect(updated?.automation_mode).toBe("HUMAN");
  });

  it("retorna null quando o lead não existe nesse tenant (isolamento entre tenants)", async () => {
    const resultado = await repo.assumeControl({ tenantId: TENANT_A }, leadDoTenantB);
    expect(resultado).toBeNull();

    // O lead do tenant B não pode ter sido alterado por um comando disparado
    // no contexto do tenant A.
    const leadB = await pool.query<{ automation_mode: string }>(
      `SELECT automation_mode FROM leads WHERE id = $1;`,
      [leadDoTenantB],
    );
    expect(leadB.rows[0]?.automation_mode).toBe("AI");
  });

  it("retorna null para um id de lead inexistente", async () => {
    const resultado = await repo.assumeControl(
      { tenantId: TENANT_A },
      "00000000-0000-0000-0000-000000000000",
    );
    expect(resultado).toBeNull();
  });

  it("findLead360 inclui as conversas do lead, para o frontend cruzar mensagem com canal", async () => {
    const view = await repo.findLead360({ tenantId: TENANT_A }, leadComConversas);

    expect(view).not.toBeNull();
    expect(view?.conversations).toHaveLength(2);
    const channels = view?.conversations.map((c) => c.channel).sort();
    expect(channels).toEqual(["INSTAGRAM", "WHATSAPP"]);
  });
});
