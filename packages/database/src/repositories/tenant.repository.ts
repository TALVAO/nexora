import { query } from "../client.js";
import type { TenantRow, TenantMemberRow, ProfileRow } from "../types.js";
import type { Role } from "@nexora/shared";

export interface CreateTenantInput {
  name: string;
  slug: string;
  timezone?: string;
}

export class TenantRepository {
  async create(input: CreateTenantInput): Promise<TenantRow> {
    const sql = `
      INSERT INTO tenants (name, slug, timezone)
      VALUES ($1, $2, COALESCE($3, 'America/Sao_Paulo'))
      RETURNING *;
    `;
    const result = await query<TenantRow>(sql, [input.name, input.slug, input.timezone ?? null]);
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao criar tenant.");
    return row;
  }

  async findById(tenantId: string): Promise<TenantRow | null> {
    const sql = `SELECT * FROM tenants WHERE id = $1 LIMIT 1;`;
    const result = await query<TenantRow>(sql, [tenantId]);
    return result.rows[0] || null;
  }

  async findBySlug(slug: string): Promise<TenantRow | null> {
    const sql = `SELECT * FROM tenants WHERE slug = $1 LIMIT 1;`;
    const result = await query<TenantRow>(sql, [slug]);
    return result.rows[0] || null;
  }

  async addMember(
    tenantId: string,
    profileId: string,
    role: Role = "AGENT",
  ): Promise<TenantMemberRow> {
    const sql = `
      INSERT INTO tenant_members (tenant_id, profile_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, profile_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
      RETURNING *;
    `;
    const result = await query<TenantMemberRow>(sql, [tenantId, profileId, role]);
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao adicionar membro ao tenant.");
    return row;
  }

  async getMemberRole(tenantId: string, profileId: string): Promise<Role | null> {
    const sql = `
      SELECT role FROM tenant_members
      WHERE tenant_id = $1 AND profile_id = $2 AND status = 'ACTIVE'
      LIMIT 1;
    `;
    const result = await query<{ role: Role }>(sql, [tenantId, profileId]);
    return result.rows[0]?.role || null;
  }

  async listMembers(tenantId: string): Promise<(TenantMemberRow & { profile: ProfileRow })[]> {
    const sql = `
      SELECT tm.*, row_to_json(p.*) as profile
      FROM tenant_members tm
      JOIN profiles p ON tm.profile_id = p.id
      WHERE tm.tenant_id = $1;
    `;
    const result = await query<TenantMemberRow & { profile: ProfileRow }>(sql, [tenantId]);
    return result.rows;
  }
}
