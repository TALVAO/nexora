import { query } from "../client.js";
import type { TenantRow, ProfileRow, TenantMemberRow, AuditLogRow } from "../types.js";
import { type Role, type PlanType, PLAN_LIMITS } from "@nexora/shared";

export interface OnboardingInput {
  companyName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string | null;
  plan?: PlanType;
}

export interface OnboardingResult {
  tenant: TenantRow;
  owner: ProfileRow;
  member: TenantMemberRow;
  plan: PlanType;
}

export interface TenantSubscriptionInfo {
  tenantId: string;
  plan: PlanType;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  currentPeriodEnd: string;
  usage: {
    leadsThisMonth: number;
    activeMembers: number;
    connectedChannels: number;
  };
  limits: {
    maxUsers: number;
    maxChannels: number;
    maxLeadsPerMonth: number;
    features: readonly string[];
  };
}

export interface InviteMemberInput {
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
}

export interface BrandingSettings {
  companyName?: string;
  primaryColor?: string;
  logoUrl?: string;
  toneOfVoice?: string;
  messageSignature?: string;
}

export class SaasRepository {
  private readonly planOverrideMap = new Map<string, PlanType>();

  /**
   * Fluxo unificado de Onboarding de novo cliente SaaS.
   */
  async onboardTenant(input: OnboardingInput): Promise<OnboardingResult> {
    const plan = input.plan || "INDIVIDUAL";

    // 1. Criar Tenant
    const tenantSql = `
      INSERT INTO tenants (name, slug, status, timezone)
      VALUES ($1, $2, 'ACTIVE', 'America/Sao_Paulo')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING *;
    `;
    const tenantRes = await query<TenantRow>(tenantSql, [input.companyName, input.slug]);
    const tenant = tenantRes.rows[0];
    if (!tenant) throw new Error("Falha ao provisionar tenant.");

    // 2. Criar ou Obter Profile do Proprietário
    const profileSql = `
      INSERT INTO profiles (name, email, phone)
      VALUES ($1, $2, $3)
      ON CONFLICT (auth_user_id) DO NOTHING
      RETURNING *;
    `;
    let ownerRes = await query<ProfileRow>(profileSql, [
      input.ownerName,
      input.ownerEmail,
      input.ownerPhone ?? null,
    ]);

    let owner = ownerRes.rows[0];
    if (!owner) {
      const findOwner = await query<ProfileRow>(
        `SELECT * FROM profiles WHERE email = $1 LIMIT 1;`,
        [input.ownerEmail],
      );
      owner = findOwner.rows[0];
    }
    if (!owner) throw new Error("Falha ao criar perfil do proprietário.");

    // 3. Vincular Membership com Role OWNER
    const memberSql = `
      INSERT INTO tenant_members (tenant_id, profile_id, role, status)
      VALUES ($1, $2, 'OWNER', 'ACTIVE')
      ON CONFLICT (tenant_id, profile_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE'
      RETURNING *;
    `;
    const memberRes = await query<TenantMemberRow>(memberSql, [tenant.id, owner.id]);
    const member = memberRes.rows[0];
    if (!member) throw new Error("Falha ao vincular permissão de proprietário.");

    // 4. Registrar em Audit Log
    await query(
      `
      INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json)
      VALUES ($1, 'USER', $2, 'TENANT_ONBOARDED', 'TENANT', $1, $3);
    `,
      [tenant.id, owner.id, JSON.stringify({ plan, companyName: input.companyName })],
    );

    this.planOverrideMap.set(tenant.id, plan);

    return {
      tenant,
      owner,
      member,
      plan,
    };
  }

  /**
   * Consulta a assinatura do tenant e consumo de limites em tempo real.
   */
  async getSubscription(tenantId: string): Promise<TenantSubscriptionInfo> {
    const plan = this.planOverrideMap.get(tenantId) || "INDIVIDUAL";
    const limits = PLAN_LIMITS[plan];

    // Contagem de leads no mês corrente
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const leadsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM leads WHERE tenant_id = $1 AND created_at >= $2;`,
      [tenantId, startOfMonth],
    );
    const leadsThisMonth = leadsRes.rows[0]?.count || 0;

    // Contagem de membros ativos
    const membersRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM tenant_members WHERE tenant_id = $1 AND status = 'ACTIVE';`,
      [tenantId],
    );
    const activeMembers = membersRes.rows[0]?.count || 1;

    // Contagem de canais conectados
    const channelsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM channel_connections WHERE tenant_id = $1 AND status = 'CONNECTED';`,
      [tenantId],
    );
    const connectedChannels = channelsRes.rows[0]?.count || 0;

    return {
      tenantId,
      plan,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      usage: {
        leadsThisMonth,
        activeMembers,
        connectedChannels,
      },
      limits,
    };
  }

  /**
   * Atualização de plano comercial.
   */
  async upgradePlan(
    tenantId: string,
    plan: PlanType,
    userId?: string,
  ): Promise<TenantSubscriptionInfo> {
    this.planOverrideMap.set(tenantId, plan);

    await query(
      `
      INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json)
      VALUES ($1, 'USER', $2, 'PLAN_UPGRADE', 'SUBSCRIPTION', $1, $3);
    `,
      [tenantId, userId || null, JSON.stringify({ newPlan: plan })],
    );

    return this.getSubscription(tenantId);
  }

  /**
   * Convidar novo membro / corretor para a equipe.
   */
  async inviteMember(
    tenantId: string,
    input: InviteMemberInput,
    actorUserId?: string,
  ): Promise<TenantMemberRow> {
    // 1. Criar ou achar profile
    let profileRes = await query<ProfileRow>(
      `INSERT INTO profiles (name, email, phone) VALUES ($1, $2, $3) RETURNING *;`,
      [input.name, input.email, input.phone ?? null],
    );
    let profile = profileRes.rows[0];
    if (!profile) {
      const found = await query<ProfileRow>(`SELECT * FROM profiles WHERE email = $1 LIMIT 1;`, [
        input.email,
      ]);
      profile = found.rows[0];
    }
    if (!profile) throw new Error("Falha ao criar perfil para o membro convidado.");

    // 2. Criar vínculo de membro
    const memberSql = `
      INSERT INTO tenant_members (tenant_id, profile_id, role, status)
      VALUES ($1, $2, $3, 'ACTIVE')
      ON CONFLICT (tenant_id, profile_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
      RETURNING *;
    `;
    const memberRes = await query<TenantMemberRow>(memberSql, [tenantId, profile.id, input.role]);
    const member = memberRes.rows[0];
    if (!member) throw new Error("Falha ao adicionar membro.");

    // 3. Auditoria
    await query(
      `
      INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json)
      VALUES ($1, 'USER', $2, 'MEMBER_INVITED', 'TENANT_MEMBER', $3, $4);
    `,
      [tenantId, actorUserId || null, member.id, JSON.stringify(input)],
    );

    return member;
  }

  /**
   * Atualizar configurações de marca e tom de voz da imobiliária.
   */
  async updateBranding(
    tenantId: string,
    settings: BrandingSettings,
    actorUserId?: string,
  ): Promise<{ success: boolean; branding: BrandingSettings }> {
    if (settings.companyName) {
      await query(`UPDATE tenants SET name = $1, updated_at = now() WHERE id = $2;`, [
        settings.companyName,
        tenantId,
      ]);
    }

    await query(
      `
      INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata_json)
      VALUES ($1, 'USER', $2, 'BRANDING_UPDATED', 'TENANT', $1, $3);
    `,
      [tenantId, actorUserId || null, JSON.stringify(settings)],
    );

    return {
      success: true,
      branding: settings,
    };
  }

  /**
   * Listar logs de auditoria de administração do tenant.
   */
  async getAuditLogs(tenantId: string, limit = 50): Promise<AuditLogRow[]> {
    const sql = `
      SELECT * FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const result = await query<AuditLogRow>(sql, [tenantId, limit]);
    return result.rows;
  }
}
