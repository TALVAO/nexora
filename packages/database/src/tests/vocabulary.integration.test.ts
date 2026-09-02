import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import { withTenantTransaction } from "../context.js";
import { VocabularyRepository } from "../repositories/vocabulary.repository.js";
import { PropertyRepository } from "../repositories/property.repository.js";

/**
 * Prova, contra PostgreSQL real, que geografia é dado DO TENANT (CLAUDE.md §10).
 *
 * Requer: npm run db:test:up
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:55432/nexora_test";

const TENANT_SP = "cccccccc-3333-3333-3333-333333333333";
const TENANT_PE = "dddddddd-4444-4444-4444-444444444444";

async function probe(): Promise<boolean> {
  const p = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const r = await p.query("SELECT to_regclass('public.tenant_locations') AS t;");
    return Boolean(r.rows[0]?.t);
  } catch {
    return false;
  } finally {
    await p.end();
  }
}

const ready = await probe();
if (!ready) {
  console.warn(
    "[Vocabulário] Suíte de integração PULADA — rode 'npm run db:test:up' para exercer de verdade.",
  );
}

describe.skipIf(!ready)("Vocabulário por tenant no banco (Etapa 13.3)", () => {
  let pool: pg.Pool;
  const vocabRepo = new VocabularyRepository();
  const propertyRepo = new PropertyRepository();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    await pool.query("DELETE FROM properties WHERE tenant_id IN ($1, $2);", [TENANT_SP, TENANT_PE]);
    await pool.query("DELETE FROM tenant_locations WHERE tenant_id IN ($1, $2);", [
      TENANT_SP,
      TENANT_PE,
    ]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_SP, TENANT_PE]);
    await pool.query(
      `INSERT INTO tenants (id, name, slug) VALUES
         ($1, 'Imobiliaria Paulista', 'voc-sp'),
         ($2, 'Imobiliaria Recife', 'voc-pe');`,
      [TENANT_SP, TENANT_PE],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM properties WHERE tenant_id IN ($1, $2);", [TENANT_SP, TENANT_PE]);
    await pool.query("DELETE FROM tenant_locations WHERE tenant_id IN ($1, $2);", [
      TENANT_SP,
      TENANT_PE,
    ]);
    await pool.query("DELETE FROM tenants WHERE id IN ($1, $2);", [TENANT_SP, TENANT_PE]);
    await pool.end();
  });

  beforeEach(() => {
    VocabularyRepository.clearCache();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  it("TESTE CRÍTICO: cada tenant carrega apenas a própria geografia", async () => {
    await withTenantTransaction(
      { tenantId: TENANT_SP },
      () =>
        vocabRepo.registerLocation(
          { tenantId: TENANT_SP },
          { kind: "NEIGHBORHOOD", name: "Moema", parentCity: "São Paulo" },
        ),
      pool,
    );
    await withTenantTransaction(
      { tenantId: TENANT_PE },
      () =>
        vocabRepo.registerLocation(
          { tenantId: TENANT_PE },
          { kind: "NEIGHBORHOOD", name: "Boa Viagem", parentCity: "Recife" },
        ),
      pool,
    );

    VocabularyRepository.clearCache();

    const sp = await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );
    const pe = await withTenantTransaction(
      { tenantId: TENANT_PE },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_PE }),
      pool,
    );

    const nomes = (v: { neighborhoods: Array<{ canonical: string }> }) =>
      v.neighborhoods.map((n) => n.canonical);

    expect(nomes(sp)).toContain("Moema");
    expect(nomes(sp)).not.toContain("Boa Viagem");

    expect(nomes(pe)).toContain("Boa Viagem");
    expect(nomes(pe)).not.toContain("Moema");
  });

  it("o catálogo padrão do mercado brasileiro chega mesmo sem cadastro do tenant", async () => {
    const vocab = await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );

    const tipos = vocab.propertyTypes.map((t) => t.canonical);
    expect(tipos).toContain("Apartamento");
    expect(tipos).toContain("Kitnet/Studio");
    expect(vocab.rentalGuarantees.map((g) => g.canonical)).toContain("Caução");
  });

  it("importar imóvel ensina a geografia do tenant sem configuração manual", async () => {
    await withTenantTransaction(
      { tenantId: TENANT_PE },
      () =>
        propertyRepo.create(
          { tenantId: TENANT_PE },
          {
            title: "Apto 3 quartos vista mar",
            transactionType: "RENT",
            propertyType: "Apartamento",
            city: "Olinda",
            neighborhood: "Casa Caiada",
            price: 3200,
          },
        ),
      pool,
    );

    VocabularyRepository.clearCache();

    const vocab = await withTenantTransaction(
      { tenantId: TENANT_PE },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_PE }),
      pool,
    );

    expect(vocab.cities.map((c) => c.canonical)).toContain("Olinda");
    expect(vocab.neighborhoods.map((n) => n.canonical)).toContain("Casa Caiada");
  });

  it("registrar o mesmo bairro duas vezes não duplica", async () => {
    for (let i = 0; i < 3; i++) {
      await withTenantTransaction(
        { tenantId: TENANT_SP },
        () =>
          vocabRepo.registerLocation(
            { tenantId: TENANT_SP },
            { kind: "NEIGHBORHOOD", name: "Pinheiros", parentCity: "São Paulo" },
          ),
        pool,
      );
    }

    const count = await pool.query(
      "SELECT count(*)::int AS n FROM tenant_locations WHERE tenant_id = $1 AND normalized_name = 'pinheiros';",
      [TENANT_SP],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it("bairro homônimo em tenants diferentes convive sem colidir", async () => {
    for (const tenantId of [TENANT_SP, TENANT_PE]) {
      await withTenantTransaction(
        { tenantId },
        () =>
          vocabRepo.registerLocation(
            { tenantId },
            {
              kind: "NEIGHBORHOOD",
              name: "Centro",
              parentCity: tenantId === TENANT_SP ? "São Paulo" : "Recife",
            },
          ),
        pool,
      );
    }

    const rows = await pool.query(
      "SELECT tenant_id FROM tenant_locations WHERE normalized_name = 'centro' AND tenant_id IN ($1, $2);",
      [TENANT_SP, TENANT_PE],
    );
    expect(rows.rowCount).toBe(2);
  });

  it("RLS bloqueia leitura da geografia alheia mesmo sem filtro no SQL", async () => {
    const visiveis = await withTenantTransaction(
      { tenantId: TENANT_SP },
      async () => {
        const { query } = await import("../client.js");
        // Sem WHERE tenant_id de propósito.
        const r = await query<{ tenant_id: string }>("SELECT tenant_id FROM tenant_locations;");
        return r.rows;
      },
      pool,
    );

    expect(visiveis.length).toBeGreaterThan(0);
    expect(visiveis.every((r) => r.tenant_id === TENANT_SP)).toBe(true);
  });
  // --------------------------------------------------------------------------
  // Regressões da verificação adversarial
  // --------------------------------------------------------------------------
  it("alias com maiúscula e acento é gravado já normalizado", async () => {
    await withTenantTransaction(
      { tenantId: TENANT_PE },
      () =>
        vocabRepo.registerLocation(
          { tenantId: TENANT_PE },
          {
            kind: "NEIGHBORHOOD",
            name: "Boa Viagem",
            parentCity: "Recife",
            aliases: ["B. Viagem", "Zona Sul"],
          },
        ),
      pool,
    );

    const row = await pool.query(
      "SELECT aliases FROM tenant_locations WHERE tenant_id = $1 AND normalized_name = 'boa viagem';",
      [TENANT_PE],
    );

    // Gravar cru fazia o apelido ser aceito, aparecer no GET e nunca casar
    // com o texto do lead, que chega normalizado.
    expect(row.rows[0]?.aliases).toEqual(["b. viagem", "zona sul"]);
  });

  it("bairro cadastrado dentro de transação aparece na leitura seguinte", async () => {
    VocabularyRepository.clearCache();

    // Popula o cache ANTES do cadastro, como faria uma mensagem em andamento.
    await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );

    await withTenantTransaction(
      { tenantId: TENANT_SP },
      () =>
        vocabRepo.registerLocation(
          { tenantId: TENANT_SP },
          { kind: "NEIGHBORHOOD", name: "Barra Funda", parentCity: "São Paulo" },
        ),
      pool,
    );

    const depois = await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );

    expect(depois.neighborhoods.map((n) => n.canonical)).toContain("Barra Funda");
  });

  it("listagem de geografia é estável entre chamadas", async () => {
    VocabularyRepository.clearCache();
    const primeira = await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );
    VocabularyRepository.clearCache();
    const segunda = await withTenantTransaction(
      { tenantId: TENANT_SP },
      () => vocabRepo.loadVocabulary({ tenantId: TENANT_SP }),
      pool,
    );

    expect(segunda.neighborhoods.map((n) => n.canonical)).toEqual(
      primeira.neighborhoods.map((n) => n.canonical),
    );
  });
});
