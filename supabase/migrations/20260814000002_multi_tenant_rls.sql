-- ==============================================================================
-- Nexora — SaaS Imobiliário
-- Migration 02: Row Level Security (RLS), Helper Functions and Policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper Security Functions
-- ------------------------------------------------------------------------------

-- Function to get the profile_id for the current auth user
CREATE OR REPLACE FUNCTION get_auth_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- Function to check if the current user belongs to a specific tenant
CREATE OR REPLACE FUNCTION is_tenant_member(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members tm
    JOIN profiles p ON tm.profile_id = p.id
    WHERE tm.tenant_id = target_tenant_id
      AND p.auth_user_id = auth.uid()
      AND tm.status = 'ACTIVE'
  );
$$;

-- Function to check if the current user has specific roles in a tenant
CREATE OR REPLACE FUNCTION has_tenant_role(target_tenant_id UUID, required_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members tm
    JOIN profiles p ON tm.profile_id = p.id
    WHERE tm.tenant_id = target_tenant_id
      AND p.auth_user_id = auth.uid()
      AND tm.status = 'ACTIVE'
      AND tm.role = ANY(required_roles)
  );
$$;

-- Function for automatic updated_at timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Triggers for updated_at
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I;', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Enable Row Level Security (RLS) on All Tables
-- ------------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. RLS Policies: Profiles
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile and coworker profiles" ON profiles;
CREATE POLICY "Users can read own profile and coworker profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR id IN (
    SELECT tm2.profile_id
    FROM tenant_members tm1
    JOIN tenant_members tm2 ON tm1.tenant_id = tm2.tenant_id
    WHERE tm1.profile_id = get_auth_profile_id()
  )
);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 5. RLS Policies: Tenants
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can view their tenant" ON tenants;
CREATE POLICY "Tenant members can view their tenant"
ON tenants FOR SELECT
TO authenticated
USING (is_tenant_member(id));

DROP POLICY IF EXISTS "Owners and Managers can update their tenant" ON tenants;
CREATE POLICY "Owners and Managers can update their tenant"
ON tenants FOR UPDATE
TO authenticated
USING (has_tenant_role(id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- ------------------------------------------------------------------------------
-- 6. RLS Policies: Tenant Members
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view membership in their tenant" ON tenant_members;
CREATE POLICY "Members can view membership in their tenant"
ON tenant_members FOR SELECT
TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Owners and Managers can manage members" ON tenant_members;
CREATE POLICY "Owners and Managers can manage members"
ON tenant_members FOR ALL
TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- ------------------------------------------------------------------------------
-- 7. Macro Policies for Multi-tenant Data Isolation
-- ------------------------------------------------------------------------------

-- Leads
DROP POLICY IF EXISTS "Tenant isolation for leads SELECT" ON leads;
CREATE POLICY "Tenant isolation for leads SELECT"
ON leads FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for leads INSERT" ON leads;
CREATE POLICY "Tenant isolation for leads INSERT"
ON leads FOR INSERT TO authenticated
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

DROP POLICY IF EXISTS "Tenant isolation for leads UPDATE" ON leads;
CREATE POLICY "Tenant isolation for leads UPDATE"
ON leads FOR UPDATE TO authenticated
USING (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

DROP POLICY IF EXISTS "Tenant isolation for leads DELETE" ON leads;
CREATE POLICY "Tenant isolation for leads DELETE"
ON leads FOR DELETE TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- Lead Profiles
DROP POLICY IF EXISTS "Tenant isolation for lead_profiles SELECT" ON lead_profiles;
CREATE POLICY "Tenant isolation for lead_profiles SELECT"
ON lead_profiles FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for lead_profiles MODIFY" ON lead_profiles;
CREATE POLICY "Tenant isolation for lead_profiles MODIFY"
ON lead_profiles FOR ALL TO authenticated
USING (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Conversations
DROP POLICY IF EXISTS "Tenant isolation for conversations SELECT" ON conversations;
CREATE POLICY "Tenant isolation for conversations SELECT"
ON conversations FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for conversations MODIFY" ON conversations;
CREATE POLICY "Tenant isolation for conversations MODIFY"
ON conversations FOR ALL TO authenticated
USING (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Messages
DROP POLICY IF EXISTS "Tenant isolation for messages SELECT" ON messages;
CREATE POLICY "Tenant isolation for messages SELECT"
ON messages FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for messages INSERT" ON messages;
CREATE POLICY "Tenant isolation for messages INSERT"
ON messages FOR INSERT TO authenticated
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Lead Stage History
DROP POLICY IF EXISTS "Tenant isolation for lead_stage_history" ON lead_stage_history;
CREATE POLICY "Tenant isolation for lead_stage_history"
ON lead_stage_history FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

-- Activities
DROP POLICY IF EXISTS "Tenant isolation for activities SELECT" ON activities;
CREATE POLICY "Tenant isolation for activities SELECT"
ON activities FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for activities MODIFY" ON activities;
CREATE POLICY "Tenant isolation for activities MODIFY"
ON activities FOR ALL TO authenticated
USING (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Visits
DROP POLICY IF EXISTS "Tenant isolation for visits SELECT" ON visits;
CREATE POLICY "Tenant isolation for visits SELECT"
ON visits FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for visits MODIFY" ON visits;
CREATE POLICY "Tenant isolation for visits MODIFY"
ON visits FOR ALL TO authenticated
USING (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (is_tenant_member(tenant_id) AND has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Properties
DROP POLICY IF EXISTS "Tenant isolation for properties SELECT" ON properties;
CREATE POLICY "Tenant isolation for properties SELECT"
ON properties FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant isolation for properties MODIFY" ON properties;
CREATE POLICY "Tenant isolation for properties MODIFY"
ON properties FOR ALL TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER', 'AGENT']::user_role[]));

-- Property Matches
DROP POLICY IF EXISTS "Tenant isolation for property_matches" ON property_matches;
CREATE POLICY "Tenant isolation for property_matches"
ON property_matches FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

-- Follow-up Sequences & Steps
DROP POLICY IF EXISTS "Tenant isolation for followup_sequences" ON followup_sequences;
CREATE POLICY "Tenant isolation for followup_sequences"
ON followup_sequences FOR ALL TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

DROP POLICY IF EXISTS "Tenant isolation for followup_steps" ON followup_steps;
CREATE POLICY "Tenant isolation for followup_steps"
ON followup_steps FOR ALL TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- Follow-up Jobs
DROP POLICY IF EXISTS "Tenant isolation for followup_jobs" ON followup_jobs;
CREATE POLICY "Tenant isolation for followup_jobs"
ON followup_jobs FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

-- Channel Connections
DROP POLICY IF EXISTS "Tenant isolation for channel_connections" ON channel_connections;
CREATE POLICY "Tenant isolation for channel_connections"
ON channel_connections FOR ALL TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- Consent Preferences
DROP POLICY IF EXISTS "Tenant isolation for consent_preferences" ON consent_preferences;
CREATE POLICY "Tenant isolation for consent_preferences"
ON consent_preferences FOR ALL TO authenticated
USING (is_tenant_member(tenant_id))
WITH CHECK (is_tenant_member(tenant_id));

-- AI Runs
DROP POLICY IF EXISTS "Tenant isolation for ai_runs" ON ai_runs;
CREATE POLICY "Tenant isolation for ai_runs"
ON ai_runs FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id));

-- Integration Syncs
DROP POLICY IF EXISTS "Tenant isolation for integration_syncs" ON integration_syncs;
CREATE POLICY "Tenant isolation for integration_syncs"
ON integration_syncs FOR ALL TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]))
WITH CHECK (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

-- Audit Logs
DROP POLICY IF EXISTS "Tenant isolation for audit_logs SELECT" ON audit_logs;
CREATE POLICY "Tenant isolation for audit_logs SELECT"
ON audit_logs FOR SELECT TO authenticated
USING (has_tenant_role(tenant_id, ARRAY['OWNER', 'MANAGER']::user_role[]));

DROP POLICY IF EXISTS "Tenant isolation for audit_logs INSERT" ON audit_logs;
CREATE POLICY "Tenant isolation for audit_logs INSERT"
ON audit_logs FOR INSERT TO authenticated
WITH CHECK (is_tenant_member(tenant_id));
