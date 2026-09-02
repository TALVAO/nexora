import { query, getTenantSession } from "../client.js";
import { assertTenantContext, type TenantContext } from "../context.js";
import {
  normalizeTerm,
  mergeVocabularyTerms,
  DEFAULT_PROPERTY_TYPES,
  DEFAULT_RENTAL_GUARANTEES,
  type TenantVocabulary,
  type LocationTerm,
  type VocabularyTerm,
} from "@nexora/shared";

export type LocationKind = "CITY" | "NEIGHBORHOOD";
export type LocationSource = "MANUAL" | "CATALOG" | "IMPORT";
export type VocabularyCategory = "PROPERTY_TYPE" | "RENTAL_GUARANTEE";

export interface TenantLocationRow {
  id: string;
  tenant_id: string;
  kind: LocationKind;
  name: string;
  normalized_name: string;
  parent_city_normalized: string | null;
  aliases: string[];
  source: LocationSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterLocationInput {
  kind: LocationKind;
  name: string;
  /** Grafia original da cidade do bairro; normalizada internamente. */
  parentCity?: string | null;
  aliases?: string[];
  source?: LocationSource;
}

export interface UpsertVocabularyInput {
  category: VocabularyCategory;
  canonicalValue: string;
  aliases?: string[];
}

interface CacheEntry {
  vocabulary: TenantVocabulary;
  expiresAt: number;
}

/**
 * Vocabulário é lido a cada mensagem recebida. Sem cache, cada "oi" no WhatsApp
 * viraria duas consultas ao banco.
 *
 * TTL curto de propósito: o corretor que cadastra um bairro novo espera vê-lo
 * funcionando em seguida, não no próximo deploy.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export class VocabularyRepository {
  /**
   * Geografia e vocabulário do tenant, já combinados com o catálogo padrão do
   * mercado brasileiro.
   *
   * A geografia NÃO tem padrão: tenant sem imóvel cadastrado e sem bairro
   * cadastrado simplesmente não reconhece bairro nenhum — que é o correto.
   * O contrário (reconhecer bairros de outro cliente) é vazamento de contexto.
   */
  async loadVocabulary(ctx: TenantContext): Promise<TenantVocabulary> {
    assertTenantContext(ctx);

    const cached = cache.get(ctx.tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.vocabulary;
    }

    const [locations, terms] = await Promise.all([
      query<TenantLocationRow>(
        // ORDER BY garante resultado estável: sem ele, dois bairros homônimos
        // em cidades diferentes chegariam em ordem arbitrária.
        `SELECT kind, name, normalized_name, parent_city_normalized, aliases
           FROM tenant_locations
          WHERE tenant_id = $1 AND is_active = TRUE
          ORDER BY kind, normalized_name, parent_city_normalized NULLS FIRST;`,
        [ctx.tenantId],
      ),
      query<{ category: VocabularyCategory; canonical_value: string; aliases: string[] }>(
        `SELECT category, canonical_value, aliases
           FROM tenant_vocabulary
          WHERE tenant_id = $1 AND is_active = TRUE;`,
        [ctx.tenantId],
      ),
    ]);

    const toLocationTerm = (row: TenantLocationRow): LocationTerm => ({
      canonical: row.name,
      normalized: row.normalized_name,
      aliases: row.aliases ?? [],
      parentCityNormalized: row.parent_city_normalized,
    });

    const tenantTermsOf = (category: VocabularyCategory): VocabularyTerm[] =>
      terms.rows
        .filter((r) => r.category === category)
        .map((r) => ({ canonical: r.canonical_value, aliases: r.aliases ?? [] }));

    const vocabulary: TenantVocabulary = {
      cities: locations.rows.filter((r) => r.kind === "CITY").map(toLocationTerm),
      neighborhoods: locations.rows.filter((r) => r.kind === "NEIGHBORHOOD").map(toLocationTerm),
      propertyTypes: mergeVocabularyTerms(DEFAULT_PROPERTY_TYPES, tenantTermsOf("PROPERTY_TYPE")),
      rentalGuarantees: mergeVocabularyTerms(
        DEFAULT_RENTAL_GUARANTEES,
        tenantTermsOf("RENTAL_GUARANTEE"),
      ),
    };

    cache.set(ctx.tenantId, { vocabulary, expiresAt: Date.now() + CACHE_TTL_MS });
    return vocabulary;
  }

  async registerLocation(
    ctx: TenantContext,
    input: RegisterLocationInput,
  ): Promise<TenantLocationRow | null> {
    assertTenantContext(ctx);

    const name = input.name.trim();
    if (!name) return null;

    const normalized = normalizeTerm(name);
    const parentCityNormalized = input.parentCity ? normalizeTerm(input.parentCity) : null;

    const result = await query<TenantLocationRow>(
      `INSERT INTO tenant_locations
         (tenant_id, kind, name, normalized_name, parent_city_normalized, aliases, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, kind, normalized_name, COALESCE(parent_city_normalized, ''))
       DO UPDATE SET
         name = EXCLUDED.name,
         -- União, não substituição: importar um imóvel (que vem sem aliases)
         -- não pode apagar os apelidos que o corretor cadastrou à mão.
         aliases = CASE
           WHEN cardinality(EXCLUDED.aliases) = 0 THEN tenant_locations.aliases
           ELSE (
             SELECT array_agg(DISTINCT a ORDER BY a)
               FROM unnest(tenant_locations.aliases || EXCLUDED.aliases) AS a
           )
         END,
         is_active = TRUE,
         updated_at = timezone('utc'::text, now())
       RETURNING *;`,
      [
        ctx.tenantId,
        input.kind,
        name,
        normalized,
        parentCityNormalized,
        // Aliases precisam ser gravados na MESMA forma que o texto do lead
        // recebe antes da comparação. Gravar cru fazia o apelido ser aceito,
        // aparecer na listagem e nunca casar.
        (input.aliases ?? []).map(normalizeTerm).filter(Boolean),
        input.source ?? "MANUAL",
      ],
    );

    this.invalidate(ctx.tenantId);
    return result.rows[0] ?? null;
  }

  /**
   * Aprende a geografia a partir do catálogo do próprio tenant.
   *
   * É o que dispensa configuração manual: quem importa imóveis passa a ter os
   * bairros reconhecidos na conversa, em qualquer cidade do país.
   */
  async registerFromProperty(
    ctx: TenantContext,
    property: { city?: string | null; neighborhood?: string | null },
  ): Promise<void> {
    assertTenantContext(ctx);

    const city = property.city?.trim();
    if (city) {
      await this.registerLocation(ctx, { kind: "CITY", name: city, source: "CATALOG" });
    }

    const neighborhood = property.neighborhood?.trim();
    if (neighborhood) {
      await this.registerLocation(ctx, {
        kind: "NEIGHBORHOOD",
        name: neighborhood,
        parentCity: city ?? null,
        source: "CATALOG",
      });
    }
  }

  async upsertVocabularyTerm(ctx: TenantContext, input: UpsertVocabularyInput): Promise<void> {
    assertTenantContext(ctx);

    const canonical = input.canonicalValue.trim();
    if (!canonical) return;

    await query(
      `INSERT INTO tenant_vocabulary (tenant_id, category, canonical_value, normalized_value, aliases)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, category, normalized_value)
       DO UPDATE SET canonical_value = EXCLUDED.canonical_value,
                     aliases = EXCLUDED.aliases,
                     is_active = TRUE,
                     updated_at = timezone('utc'::text, now());`,
      [
        ctx.tenantId,
        input.category,
        canonical,
        normalizeTerm(canonical),
        (input.aliases ?? []).map(normalizeTerm),
      ],
    );

    this.invalidate(ctx.tenantId);
  }

  async listLocations(ctx: TenantContext, kind?: LocationKind): Promise<TenantLocationRow[]> {
    assertTenantContext(ctx);

    const result = await query<TenantLocationRow>(
      `SELECT * FROM tenant_locations
        WHERE tenant_id = $1
          AND ($2::location_kind IS NULL OR kind = $2::location_kind)
        ORDER BY kind, name;`,
      [ctx.tenantId, kind ?? null],
    );
    return result.rows;
  }

  /**
   * Deriva a geografia do catálogo JÁ cadastrado.
   *
   * `registerFromProperty` só roda em imóvel novo; sem este backfill, quem
   * importou o catálogo antes desta etapa continuaria sem geografia nenhuma.
   */
  async backfillFromProperties(ctx: TenantContext): Promise<{ registered: number }> {
    assertTenantContext(ctx);

    const result = await query<{ city: string | null; neighborhood: string | null }>(
      `SELECT DISTINCT city, neighborhood
         FROM properties
        WHERE tenant_id = $1
          AND city IS NOT NULL;`,
      [ctx.tenantId],
    );

    let registered = 0;
    for (const row of result.rows) {
      await this.registerFromProperty(ctx, row);
      registered++;
    }

    this.invalidate(ctx.tenantId);
    return { registered };
  }

  /**
   * Desativa em vez de apagar: leads antigos podem referenciar o bairro, e
   * perder o histórico para "limpar a lista" é pior que manter o registro.
   */
  async deactivateLocation(ctx: TenantContext, locationId: string): Promise<boolean> {
    assertTenantContext(ctx);

    const result = await query(
      `UPDATE tenant_locations
          SET is_active = FALSE, updated_at = timezone('utc'::text, now())
        WHERE id = $1 AND tenant_id = $2;`,
      [locationId, ctx.tenantId],
    );

    this.invalidate(ctx.tenantId);
    return (result.rowCount ?? 0) > 0;
  }

  async listVocabulary(
    ctx: TenantContext,
    category?: VocabularyCategory,
  ): Promise<
    Array<{
      id: string;
      category: VocabularyCategory;
      canonical_value: string;
      aliases: string[];
      is_active: boolean;
    }>
  > {
    assertTenantContext(ctx);

    const result = await query<{
      id: string;
      category: VocabularyCategory;
      canonical_value: string;
      aliases: string[];
      is_active: boolean;
    }>(
      `SELECT id, category, canonical_value, aliases, is_active
         FROM tenant_vocabulary
        WHERE tenant_id = $1
          AND ($2::vocabulary_category IS NULL OR category = $2::vocabulary_category)
        ORDER BY category, canonical_value;`,
      [ctx.tenantId, category ?? null],
    );
    return result.rows;
  }

  invalidate(tenantId: string): void {
    cache.delete(tenantId);

    // Dentro de uma transação, apagar agora não basta: um leitor concorrente
    // (o webhook, que não abre sessão de tenant) pode repovoar o cache com o
    // estado pré-COMMIT e servi-lo pelos 60s seguintes. O corretor cadastraria
    // o bairro, receberia 201, e o WhatsApp continuaria sem reconhecê-lo.
    const session = getTenantSession();
    if (session?.tenantId === tenantId) {
      session.afterCommit.push(() => cache.delete(tenantId));
    }
  }

  /** Usado pelos testes para garantir isolamento entre casos. */
  static clearCache(): void {
    cache.clear();
  }
}
