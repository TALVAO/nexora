import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { VisitRow } from "../types.js";
import type { VisitStatus } from "@nexora/shared";

export interface CreateVisitInput {
  leadId: string;
  propertyId?: string | null;
  assignedUserId?: string | null;
  scheduledAt: string;
  feedback?: string | null;
}

export interface UpdateVisitInput {
  scheduledAt?: string;
  status?: VisitStatus;
  feedback?: string | null;
  assignedUserId?: string | null;
}

export interface VisitFilterParams {
  status?: VisitStatus;
  leadId?: string;
  assignedUserId?: string;
  limit?: number;
  offset?: number;
}

export class VisitRepository {
  async create(ctx: TenantContext, input: CreateVisitInput): Promise<VisitRow> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO visits (
        tenant_id,
        lead_id,
        property_id,
        assigned_user_id,
        scheduled_at,
        status,
        feedback
      ) VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6)
      RETURNING *;
    `;

    const params = [
      ctx.tenantId,
      input.leadId,
      input.propertyId ?? null,
      input.assignedUserId ?? null,
      input.scheduledAt,
      input.feedback ?? null,
    ];

    const result = await query<VisitRow>(sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error("Falha ao criar agendamento de visita.");
    }
    return row;
  }

  async findById(ctx: TenantContext, id: string): Promise<VisitRow | null> {
    assertTenantContext(ctx);

    const sql = `SELECT * FROM visits WHERE id = $1 AND tenant_id = $2 LIMIT 1;`;
    const result = await query<VisitRow>(sql, [id, ctx.tenantId]);
    return result.rows[0] || null;
  }

  async list(ctx: TenantContext, filters?: VisitFilterParams): Promise<VisitRow[]> {
    assertTenantContext(ctx);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.leadId) {
      conditions.push(`lead_id = $${idx++}`);
      params.push(filters.leadId);
    }
    if (filters?.assignedUserId) {
      conditions.push(`assigned_user_id = $${idx++}`);
      params.push(filters.assignedUserId);
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const sql = `
      SELECT * FROM visits
      WHERE ${conditions.join(" AND ")}
      ORDER BY scheduled_at ASC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const result = await query<VisitRow>(sql, params);
    return result.rows;
  }

  async update(ctx: TenantContext, id: string, input: UpdateVisitInput): Promise<VisitRow | null> {
    assertTenantContext(ctx);

    const fields: string[] = [];
    const params: unknown[] = [id, ctx.tenantId];
    let index = 3;

    if (input.scheduledAt !== undefined) {
      fields.push(`scheduled_at = $${index++}`);
      params.push(input.scheduledAt);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${index++}`);
      params.push(input.status);
    }
    if (input.feedback !== undefined) {
      fields.push(`feedback = $${index++}`);
      params.push(input.feedback);
    }
    if (input.assignedUserId !== undefined) {
      fields.push(`assigned_user_id = $${index++}`);
      params.push(input.assignedUserId);
    }

    if (fields.length === 0) {
      return this.findById(ctx, id);
    }

    const sql = `
      UPDATE visits
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *;
    `;

    const result = await query<VisitRow>(sql, params);
    return result.rows[0] || null;
  }

  async delete(ctx: TenantContext, id: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `DELETE FROM visits WHERE id = $1 AND tenant_id = $2;`;
    const result = await query(sql, [id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
