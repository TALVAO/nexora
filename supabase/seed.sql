-- ==============================================================================
-- Nexora — SaaS Imobiliário
-- Seed Data for Multi-tenant Testing and Local Development
-- ==============================================================================

-- 1. Create Test Tenants
INSERT INTO tenants (id, name, slug, status, timezone)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Imobiliária Alvorada', 'alvorada', 'ACTIVE', 'America/Sao_Paulo'),
  ('b0000000-0000-0000-0000-000000000002', 'Corretora Bela Vista', 'bela-vista', 'ACTIVE', 'America/Sao_Paulo')
ON CONFLICT (id) DO NOTHING;

-- 2. Create User Profiles
INSERT INTO profiles (id, auth_user_id, name, email, phone)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Carlos Owner A', 'carlos@alvorada.com', '5511988880001'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000002', 'Ana Agent A', 'ana@alvorada.com', '5511988880002'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000003', 'Bruno Owner B', 'bruno@belavista.com', '5511988880003'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000004', 'Beatriz Agent B', 'beatriz@belavista.com', '5511988880004')
ON CONFLICT (id) DO NOTHING;

-- 3. Link Memberships
INSERT INTO tenant_members (id, tenant_id, profile_id, role, status)
VALUES
  ('aa111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'OWNER', 'ACTIVE'),
  ('aa222222-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'AGENT', 'ACTIVE'),
  ('bb333333-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'OWNER', 'ACTIVE'),
  ('bb444444-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'AGENT', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 4. Sample Leads in Tenant A
INSERT INTO leads (id, tenant_id, assigned_user_id, name, phone, source, intent, stage, temperature, score, automation_mode)
VALUES
  ('1a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Lucas Silva', '5511977770001', 'WHATSAPP', 'Locação de 2 dormitórios', 'QUALIFIED', 'HOT', 85, 'AI')
ON CONFLICT (id) DO NOTHING;

-- 5. Sample Leads in Tenant B
INSERT INTO leads (id, tenant_id, assigned_user_id, name, phone, source, intent, stage, temperature, score, automation_mode)
VALUES
  ('2b000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Mariana Costa', '5511977770002', 'WHATSAPP', 'Compra de casa em condomínio', 'CONTACTED', 'WARM', 60, 'HUMAN')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 6. Geografia POR TENANT (Etapa 13.3)
--
-- Repare que cada tenant opera numa região diferente. É exatamente isto que o
-- código deixou de saber: a lista de bairros saiu do `structured-extractor.ts`
-- e virou dado. Um lead que cita "Eloy Chaves" só é entendido dentro do tenant
-- que atende Jundiaí.
--
-- `normalized_name` precisa bater com o `normalizeTerm()` de @nexora/shared:
-- minúsculo, sem acento, espaços colapsados.
-- ==============================================================================

-- Tenant A — Imobiliária Alvorada, região de Jundiaí/SP
INSERT INTO tenant_locations (tenant_id, kind, name, normalized_name, parent_city_normalized, source)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'CITY', 'Jundiaí', 'jundiai', NULL, 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'CITY', 'Itupeva', 'itupeva', NULL, 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'CITY', 'Louveira', 'louveira', NULL, 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Eloy Chaves', 'eloy chaves', 'jundiai', 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Anhangabaú', 'anhangabau', 'jundiai', 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Vila Arens', 'vila arens', 'jundiai', 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Medeiros', 'medeiros', 'jundiai', 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Retiro', 'retiro', 'jundiai', 'MANUAL'),
  ('a0000000-0000-0000-0000-000000000001', 'NEIGHBORHOOD', 'Centro', 'centro', 'jundiai', 'MANUAL')
ON CONFLICT DO NOTHING;

-- Alias real de campo: leads escrevem "Eloi Chaves" com frequência.
UPDATE tenant_locations
   SET aliases = ARRAY['eloi chaves']
 WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
   AND normalized_name = 'eloy chaves';

-- Tenant B — Corretora Bela Vista, capital paulista
INSERT INTO tenant_locations (tenant_id, kind, name, normalized_name, parent_city_normalized, source)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'CITY', 'São Paulo', 'sao paulo', NULL, 'MANUAL'),
  ('b0000000-0000-0000-0000-000000000002', 'NEIGHBORHOOD', 'Moema', 'moema', 'sao paulo', 'MANUAL'),
  ('b0000000-0000-0000-0000-000000000002', 'NEIGHBORHOOD', 'Pinheiros', 'pinheiros', 'sao paulo', 'MANUAL'),
  ('b0000000-0000-0000-0000-000000000002', 'NEIGHBORHOOD', 'Vila Mariana', 'vila mariana', 'sao paulo', 'MANUAL'),
  ('b0000000-0000-0000-0000-000000000002', 'NEIGHBORHOOD', 'Tatuapé', 'tatuape', 'sao paulo', 'MANUAL'),
  ('b0000000-0000-0000-0000-000000000002', 'NEIGHBORHOOD', 'Centro', 'centro', 'sao paulo', 'MANUAL')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 7. Conexoes de canal (Etapa 13.4)
--
-- E por `external_account_id` que o webhook descobre de quem e a mensagem.
-- Sem uma linha aqui, todo webhook do tenant e recusado com 403 — que e o
-- comportamento correto: nao existe mais tenant "padrao".
--
-- `webhook_secret` fica FORA do seed de proposito: sem ele vale o segredo
-- global do provider (EVOLUTION_WEBHOOK_TOKEN / META_APP_SECRET), que mora em
-- variavel de ambiente e nunca no repositorio (CLAUDE.md secao 35).
-- ==============================================================================
INSERT INTO channel_connections (tenant_id, channel, provider, external_account_id, display_name, status)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'WHATSAPP', 'evolution', 'nexora-alvorada', 'WhatsApp Alvorada', 'CONNECTED'),
  ('b0000000-0000-0000-0000-000000000002', 'WHATSAPP', 'evolution', 'nexora-bela-vista', 'WhatsApp Bela Vista', 'CONNECTED')
ON CONFLICT DO NOTHING;
