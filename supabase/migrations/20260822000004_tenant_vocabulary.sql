-- ==============================================================================
-- Nexora — SaaS Imobiliário
-- Migration 04: Geografia e vocabulário POR TENANT
-- Etapa 13.3
-- ==============================================================================
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- `packages/ai/src/structured-extractor.ts` carregava listas literais de bairros
-- de Jundiaí e cidades vizinhas dentro do domínio compartilhado. Consequências:
--
--   * viola o §10 do CLAUDE.md ("não hardcodar o cliente zero");
--   * uma imobiliária de Recife ou Porto Alegre nunca teria o bairro reconhecido;
--   * um lead de Jundiaí seria reconhecido dentro de QUALQUER tenant, o que é
--     vazamento de contexto entre clientes.
--
-- SOLUÇÃO
--
-- Geografia vira DADO do tenant. E, como `properties` já guarda `city` e
-- `neighborhood`, o catálogo do próprio tenant alimenta essa tabela: quem
-- importa imóveis ganha o vocabulário geográfico de graça, sem configurar nada.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------------------------
DO $types$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_kind') THEN
    CREATE TYPE location_kind AS ENUM ('CITY', 'NEIGHBORHOOD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_source') THEN
    -- MANUAL: cadastrado pelo corretor. CATALOG: derivado de um imóvel importado.
    CREATE TYPE location_source AS ENUM ('MANUAL', 'CATALOG', 'IMPORT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vocabulary_category') THEN
    CREATE TYPE vocabulary_category AS ENUM ('PROPERTY_TYPE', 'RENTAL_GUARANTEE');
  END IF;
END
$types$;

-- ------------------------------------------------------------------------------
-- 2. Geografia do tenant
--
-- `normalized_name` guarda a forma comparável (minúscula, sem acento), calculada
-- pela aplicação. `name` preserva a grafia de exibição.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind location_kind NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  -- Para NEIGHBORHOOD: cidade normalizada à qual o bairro pertence. Sem isto,
  -- "Centro" de duas cidades diferentes colidiria.
  parent_city_normalized TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  source location_source NOT NULL DEFAULT 'MANUAL',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- COALESCE porque NULL não conflita em índice único: sem isso a mesma cidade
-- poderia ser cadastrada infinitas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_location
  ON tenant_locations (tenant_id, kind, normalized_name, COALESCE(parent_city_normalized, ''));

CREATE INDEX IF NOT EXISTS idx_tenant_locations_lookup
  ON tenant_locations (tenant_id, kind, is_active);

-- ------------------------------------------------------------------------------
-- 3. Vocabulário de negócio do tenant
--
-- Guarda apenas o que o tenant ACRESCENTA ou renomeia. O catálogo padrão do
-- mercado brasileiro (Apartamento, Casa, Kitnet, Caução, Fiador...) vive em
-- código porque é vocabulário do setor, não do primeiro cliente.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category vocabulary_category NOT NULL,
  canonical_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_vocabulary
  ON tenant_vocabulary (tenant_id, category, normalized_value);

CREATE INDEX IF NOT EXISTS idx_tenant_vocabulary_lookup
  ON tenant_vocabulary (tenant_id, category, is_active);

-- ------------------------------------------------------------------------------
-- 4. updated_at automático
-- ------------------------------------------------------------------------------
DO $trg$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    FOREACH t IN ARRAY ARRAY['tenant_locations', 'tenant_vocabulary'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
      EXECUTE format(
        'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t
      );
    END LOOP;
  END IF;
END
$trg$;

-- ------------------------------------------------------------------------------
-- 5. Isolamento — tabela nova nasce com RLS, nunca depois
--
-- A migration 03 só alcançou as tabelas que existiam quando rodou. Sem este
-- bloco, estas duas nasceriam desprotegidas.
-- ------------------------------------------------------------------------------
DO $iso$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_locations', 'tenant_vocabulary'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS app_tenant_isolation ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY app_tenant_isolation ON public.%I
         FOR ALL
         USING (tenant_id = current_app_tenant_id())
         WITH CHECK (tenant_id = current_app_tenant_id());',
      t
    );
  END LOOP;
END
$iso$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_locations TO nexora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_vocabulary TO nexora_app;
