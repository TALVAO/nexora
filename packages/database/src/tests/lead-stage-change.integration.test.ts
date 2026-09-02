import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { LeadRepository } from "../repositories/lead.repository.js";
import { closeDatabasePool } from "../client.js";

/**
 * Mudar estágio do lead (Etapa 14.3 — Funil Kanban).
 *
 * Regressão dedicada: `changeStage` já quebrou DUAS vezes contra Postgres real
 * por causa de nomes de coluna que não existem no schema (`changed_by_profile_id`
 * em `lead_stage_history`, e o `addActivity` interno com colunas erradas em
 * `activities`) — nenhuma delas foi pega por teste, só por reprodução manual.
 * Este arquivo existe para que a próxima regressão nesse método seja pega
 * automaticamente, não de novo por sorte numa verificação manual.
 *
 * Requer: npm run db:test:up
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

process.env.DATABASE_URL = TEST_DATABASE_URL;

const TENANT_A = "eeeeeeee-3333-3333-3333-333333333333";

async function probe(): Promise<boolean> {
  const p = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const r = await p.query(
      "SELECT to_regclass('public.leads') AS leads, to_regclass('public.lead_stage_history') AS history;",
    );
    return Boolean(r.rows[0]?.leads) && Boolean(r.rows[0]?.history);
  } catch {
    return false;
  } finally {
    await p.end();
  }
}

const ready = await probe();
if (!ready) {
  console.warn("[Mudar estágio] Suíte de integração PULADA — rode 'npm run db:test:up'.");
}

describe.skipIf(!ready)("LeadRepository.changeStage — funil (Etapa 14.3)", () => {
  let pool: pg.Pool;
  const repo = new LeadRepository();

  let leadId: string;

  beforeAll(async () => {
    await closeDatabasePool();
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    await pool.query("DELETE FROM leads WHERE tenant_id = $1;", [TENANT_A]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [TENANT_A]);
    await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Imobiliaria C', 'funil-c');`, [
      TENANT_A,
    ]);

    const leadResult = await pool.query(
      `INSERT INTO leads (tenant_id, name, phone, source, stage)
       VALUES ($1, 'Lead do funil', '5511900000004', 'WHATSAPP', 'NEW')
       RETURNING id;`,
      [TENANT_A],
    );
    leadId = leadResult.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM leads WHERE tenant_id = $1;", [TENANT_A]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [TENANT_A]);
    await pool.end();
    await closeDatabasePool();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  it("TESTE CRÍTICO: move o lead de estágio sem lançar contra Postgres real, e registra o histórico", async () => {
    const updated = await repo.changeStage({ tenantId: TENANT_A }, leadId, "QUALIFYING");

    expect(updated.stage).toBe("QUALIFYING");

    const history = await pool.query<{
      from_stage: string | null;
      to_stage: string;
      changed_by_type: string;
      changed_by_id: string | null;
    }>(
      `SELECT from_stage, to_stage, changed_by_type, changed_by_id
       FROM lead_stage_history WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1;`,
      [leadId],
    );

    expect(history.rows[0]?.from_stage).toBe("NEW");
    expect(history.rows[0]?.to_stage).toBe("QUALIFYING");
    // Sem profileId informado, a transição é atribuída ao sistema, não a um
    // usuário específico — é o que o Kanban faz quando o corretor não está
    // identificado na chamada (comportamento atual do endpoint).
    expect(history.rows[0]?.changed_by_type).toBe("SYSTEM");
    expect(history.rows[0]?.changed_by_id).toBeNull();
  });

  it("registra changed_by_type USER e changed_by_id quando um profileId é passado", async () => {
    const profileId = "11111111-2222-3333-4444-555555555555";
    await repo.changeStage({ tenantId: TENANT_A }, leadId, "QUALIFIED", profileId);

    const history = await pool.query<{ changed_by_type: string; changed_by_id: string | null }>(
      `SELECT changed_by_type, changed_by_id
       FROM lead_stage_history WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1;`,
      [leadId],
    );

    expect(history.rows[0]?.changed_by_type).toBe("USER");
    expect(history.rows[0]?.changed_by_id).toBe(profileId);
  });

  it("uma falha em addActivity (bug pré-existente de activities) não impede a mudança de estágio", async () => {
    // changeStage já tolera addActivity falhar (try/catch interno) — este
    // teste prova o efeito, não a causa: mesmo com o bug conhecido de
    // activities ainda presente, o estágio muda de verdade no banco.
    const updated = await repo.changeStage({ tenantId: TENANT_A }, leadId, "VISIT_SCHEDULED");
    expect(updated.stage).toBe("VISIT_SCHEDULED");

    const lead = await pool.query<{ stage: string }>(`SELECT stage FROM leads WHERE id = $1;`, [
      leadId,
    ]);
    expect(lead.rows[0]?.stage).toBe("VISIT_SCHEDULED");
  });
});
