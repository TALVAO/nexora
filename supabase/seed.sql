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
