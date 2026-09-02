-- ==============================================================================
-- Nexora — SaaS Imobiliário
-- Migration 03: RLS efetivo por sessão + role de aplicação com privilégio mínimo
-- Etapa 13.2
-- ==============================================================================
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- A migration 02 declarou RLS usando `auth.uid()`, função que só existe dentro
-- do Supabase. Consequências verificadas em PostgreSQL puro:
--
--   * a migration 02 aborta na primeira função (schema "auth" does not exist);
--   * nenhuma policy é criada;
--   * RLS fica DESLIGADO nas 20 tabelas.
--
-- E mesmo no Supabase o `auth.uid()` é NULL na conexão `pg` crua usada pela API,
-- que ainda por cima conecta como superuser — e superuser ignora RLS.
--
-- SOLUÇÃO
--
-- Isolamento baseado em variável de sessão (`app.current_tenant_id`), definida
-- por transação pela aplicação, combinada com uma role sem BYPASSRLS. A API
-- REBAIXA o próprio privilégio durante toda consulta de negócio: se um SELECT
-- esquecer o `WHERE tenant_id`, o banco recusa mesmo assim.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Compatibilidade com PostgreSQL puro (local/self-hosted)
--
-- No Supabase o schema `auth` já existe e nada aqui o altera. Fora dele, cria
-- um stub mínimo para que a migration 02 possa ser aplicada em ambiente local.
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

DO $shim$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS UUID
      LANGUAGE sql STABLE
      AS 'SELECT nullif(current_setting(''app.current_user_id'', true), '''')::uuid';
    $fn$;
  END IF;
END
$shim$;

-- Roles que o Supabase provisiona automaticamente e que a migration 02
-- referencia nos GRANTs. Fora do Supabase elas não existem.
DO $roles$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOBYPASSRLS;', r);
    END IF;
  END LOOP;
END
$roles$;

-- ------------------------------------------------------------------------------
-- 2. Tenant da sessão corrente
--
-- Retorna NULL quando a variável não foi definida. Como toda policy compara
-- `tenant_id = current_app_tenant_id()`, NULL reprova a comparação e o acesso
-- é negado. Fail closed é intencional.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_app_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

COMMENT ON FUNCTION current_app_tenant_id() IS
  'Tenant da sessão, definido pela aplicação via SET LOCAL app.current_tenant_id. NULL nega tudo.';

-- ------------------------------------------------------------------------------
-- 3. Role de aplicação — privilégio mínimo (CLAUDE.md §34)
--
-- NOLOGIN: ninguém conecta diretamente com ela; a API assume a role via
-- SET LOCAL ROLE dentro da transação.
-- NOBYPASSRLS: é o ponto inteiro deste arquivo.
-- Sem DDL, sem TRUNCATE, sem REFERENCES.
-- ------------------------------------------------------------------------------
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_app') THEN
    CREATE ROLE nexora_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$role$;

GRANT USAGE ON SCHEMA public TO nexora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexora_app;
GRANT EXECUTE ON FUNCTION current_app_tenant_id() TO nexora_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexora_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexora_app;

-- ------------------------------------------------------------------------------
-- 4. Isolamento nas tabelas com tenant_id
--
-- FORCE ROW LEVEL SECURITY sujeita também o dono da tabela às policies — sem
-- ele, o owner continuaria enxergando tudo.
-- ------------------------------------------------------------------------------
DO $iso$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN information_schema.columns col
      ON col.table_name = c.relname
     AND col.table_schema = 'public'
     AND col.column_name = 'tenant_id'
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
  LOOP
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

-- ------------------------------------------------------------------------------
-- 5. Tabelas sem coluna tenant_id
-- ------------------------------------------------------------------------------

-- tenants: a sessão só enxerga o próprio tenant.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_tenant_isolation ON public.tenants;
CREATE POLICY app_tenant_isolation ON public.tenants
  FOR ALL
  USING (id = current_app_tenant_id())
  WITH CHECK (id = current_app_tenant_id());

-- profiles: é global por natureza (uma pessoa pode atuar em várias imobiliárias).
-- A sessão só enxerga perfis que compartilham o tenant corrente.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_tenant_isolation ON public.profiles;
CREATE POLICY app_tenant_isolation ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.profile_id = profiles.id
        AND tm.tenant_id = current_app_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.profile_id = profiles.id
        AND tm.tenant_id = current_app_tenant_id()
    )
  );
