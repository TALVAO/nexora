import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { LeadRow } from "../types.js";
import type { Stage, Channel, AutomationMode } from "@nexora/shared";

export interface CreateLeadInput {
  name?: string | null;
  phone?: string | null;
  instagram_user_id?: string | null;
  email?: string | null;
  source: Channel;
  intent?: string | null;
  stage?: Stage;
  score?: number;
  automation_mode?: AutomationMode;
  assigned_user_id?: string | null;
}

export interface UpdateLeadInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  intent?: string | null;
  stage?: Stage;
  score?: number;
  automation_mode?: AutomationMode;
  assigned_user_id?: string | null;
  lost_reason?: string | null;
}

export class LeadRepository {
  async create(ctx: TenantContext, input: CreateLeadInput): Promise<LeadRow> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO leads (
        tenant_id,
        name,
        phone,
        instagram_user_id,
        email,
        source,
        intent,
        stage,
        score,
        automation_mode,
        assigned_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'NEW'), COALESCE($9, 0), COALESCE($10, 'AI'), $11)
      RETURNING *;
    `;

    const params = [
      ctx.tenantId,
      input.name ?? null,
      input.phone ?? null,
      input.instagram_user_id ?? null,
      input.email ?? null,
      input.source,
      input.intent ?? null,
      input.stage ?? null,
      input.score ?? null,
      input.automation_mode ?? null,
      input.assigned_user_id ?? null,
    ];

    const result = await query<LeadRow>(sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error("Falha ao criar lead no banco de dados.");
    }
    return row;
  }

  async findById(ctx: TenantContext, id: string): Promise<LeadRow | null> {
    assertTenantContext(ctx);

    const sql = `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1;`;
    const result = await query<LeadRow>(sql, [id, ctx.tenantId]);
    return result.rows[0] || null;
  }

  async list(ctx: TenantContext, limit = 20, offset = 0): Promise<LeadRow[]> {
    assertTenantContext(ctx);

    const sql = `
      SELECT * FROM leads
      WHERE tenant_id = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await query<LeadRow>(sql, [ctx.tenantId, limit, offset]);
    return result.rows;
  }

  async update(ctx: TenantContext, id: string, input: UpdateLeadInput): Promise<LeadRow | null> {
    assertTenantContext(ctx);

    const fields: string[] = [];
    const params: unknown[] = [id, ctx.tenantId];
    let index = 3;

    if (input.name !== undefined) {
      fields.push(`name = $${index++}`);
      params.push(input.name);
    }
    if (input.phone !== undefined) {
      fields.push(`phone = $${index++}`);
      params.push(input.phone);
    }
    if (input.email !== undefined) {
      fields.push(`email = $${index++}`);
      params.push(input.email);
    }
    if (input.intent !== undefined) {
      fields.push(`intent = $${index++}`);
      params.push(input.intent);
    }
    if (input.stage !== undefined) {
      fields.push(`stage = $${index++}`);
      params.push(input.stage);
    }
    if (input.score !== undefined) {
      fields.push(`score = $${index++}`);
      params.push(input.score);
    }
    if (input.automation_mode !== undefined) {
      fields.push(`automation_mode = $${index++}`);
      params.push(input.automation_mode);
    }
    if (input.assigned_user_id !== undefined) {
      fields.push(`assigned_user_id = $${index++}`);
      params.push(input.assigned_user_id);
    }
    if (input.lost_reason !== undefined) {
      fields.push(`lost_reason = $${index++}`);
      params.push(input.lost_reason);
    }

    if (fields.length === 0) {
      return this.findById(ctx, id);
    }

    const sql = `
      UPDATE leads
      SET ${fields.join(", ")}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *;
    `;

    const result = await query<LeadRow>(sql, params);
    return result.rows[0] || null;
  }

  async delete(ctx: TenantContext, id: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `DELETE FROM leads WHERE id = $1 AND tenant_id = $2;`;
    const result = await query(sql, [id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
