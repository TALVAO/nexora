import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { FollowupJobRow } from "../types.js";
import type { FollowupStatus } from "@nexora/shared";

export interface FollowupSequenceRow {
  id: string;
  tenant_id: string;
  name: string;
  trigger_type: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  channel: "WHATSAPP" | "INSTAGRAM";
  created_at: string;
  updated_at: string;
}

export interface CreateFollowupJobInput {
  leadId: string;
  conversationId?: string | null;
  sequenceId?: string | null;
  stepId?: string | null;
  scheduledAt: string;
}

export class FollowupRepository {
  async createJob(ctx: TenantContext, input: CreateFollowupJobInput): Promise<FollowupJobRow> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO followup_jobs (
        tenant_id,
        lead_id,
        conversation_id,
        sequence_id,
        step_id,
        scheduled_at,
        status,
        attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0)
      RETURNING *;
    `;

    const result = await query<FollowupJobRow>(sql, [
      ctx.tenantId,
      input.leadId,
      input.conversationId ?? null,
      input.sequenceId ?? null,
      input.stepId ?? null,
      input.scheduledAt,
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Falha ao criar job de follow-up.");
    return row;
  }

  async findJobById(ctx: TenantContext, id: string): Promise<FollowupJobRow | null> {
    assertTenantContext(ctx);

    const sql = `SELECT * FROM followup_jobs WHERE id = $1 AND tenant_id = $2 LIMIT 1;`;
    const result = await query<FollowupJobRow>(sql, [id, ctx.tenantId]);
    return result.rows[0] || null;
  }

  async listJobs(
    ctx: TenantContext,
    filters?: { status?: FollowupStatus; leadId?: string; limit?: number },
  ): Promise<FollowupJobRow[]> {
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

    const limit = filters?.limit || 50;
    const sql = `
      SELECT * FROM followup_jobs
      WHERE ${conditions.join(" AND ")}
      ORDER BY scheduled_at ASC
      LIMIT $${idx++};
    `;
    params.push(limit);

    const result = await query<FollowupJobRow>(sql, params);
    return result.rows;
  }

  async cancelJobsForLead(
    ctx: TenantContext,
    leadId: string,
    cancelReason: string,
  ): Promise<number> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET status = 'CANCELLED', cancel_reason = $1, updated_at = now()
      WHERE tenant_id = $2 AND lead_id = $3 AND status = 'PENDING';
    `;

    const result = await query(sql, [cancelReason, ctx.tenantId, leadId]);
    return result.rowCount ?? 0;
  }

  async cancelJob(ctx: TenantContext, id: string, cancelReason: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET status = 'CANCELLED', cancel_reason = $1, updated_at = now()
      WHERE id = $2 AND tenant_id = $3 AND status = 'PENDING';
    `;

    const result = await query(sql, [cancelReason, id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  async blockJob(ctx: TenantContext, id: string, blockedReason: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET status = 'BLOCKED', blocked_reason = $1, updated_at = now()
      WHERE id = $2 AND tenant_id = $3;
    `;

    const result = await query(sql, [blockedReason, id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  async checkLeadOptOut(ctx: TenantContext, leadId: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `SELECT opted_out FROM consent_preferences WHERE tenant_id = $1 AND lead_id = $2 LIMIT 1;`;
    const result = await query<{ opted_out: boolean }>(sql, [ctx.tenantId, leadId]);
    return result.rows[0]?.opted_out ?? false;
  }

  async countRecentSentFollowups(ctx: TenantContext, leadId: string, days = 7): Promise<number> {
    assertTenantContext(ctx);

    const sql = `
      SELECT COUNT(*)::text as count FROM followup_jobs
      WHERE tenant_id = $1 AND lead_id = $2 AND status = 'SENT'
        AND executed_at >= now() - ($3 || ' days')::INTERVAL;
    `;
    const result = await query<{ count: string }>(sql, [ctx.tenantId, leadId, days]);
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  async markJobSent(ctx: TenantContext, id: string, providerMessageId?: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET status = 'SENT', provider_message_id = $1, executed_at = now(), updated_at = now()
      WHERE id = $2 AND tenant_id = $3;
    `;

    const result = await query(sql, [providerMessageId ?? null, id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  async incrementJobAttempts(ctx: TenantContext, id: string, maxAttempts = 3): Promise<void> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET attempts = attempts + 1,
          status = CASE WHEN attempts + 1 >= $1 THEN 'FAILED'::followup_status ELSE status END,
          updated_at = now()
      WHERE id = $2 AND tenant_id = $3;
    `;

    await query(sql, [maxAttempts, id, ctx.tenantId]);
  }

  async lockDueJobs(ctx: TenantContext, workerId: string, limit = 20): Promise<FollowupJobRow[]> {
    assertTenantContext(ctx);

    const sql = `
      UPDATE followup_jobs
      SET status = 'PROCESSING', locked_at = now(), locked_by = $1, updated_at = now()
      WHERE id IN (
        SELECT id FROM followup_jobs
        WHERE tenant_id = $2
          AND status = 'PENDING'
          AND scheduled_at <= now()
          AND (locked_at IS NULL OR locked_at < now() - INTERVAL '5 minutes')
        ORDER BY scheduled_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;

    const result = await query<FollowupJobRow>(sql, [workerId, ctx.tenantId, limit]);
    return result.rows;
  }

  async listSequences(ctx: TenantContext): Promise<FollowupSequenceRow[]> {
    assertTenantContext(ctx);

    const sql = `
      SELECT * FROM followup_sequences
      WHERE tenant_id = $1
      ORDER BY created_at ASC;
    `;

    const result = await query<FollowupSequenceRow>(sql, [ctx.tenantId]);
    return result.rows;
  }
}
