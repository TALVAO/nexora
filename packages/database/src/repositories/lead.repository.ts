import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { LeadRow, MessageRow } from "../types.js";
import type { Stage, Channel, AutomationMode, Temperature } from "@nexora/shared";

export interface CreateLeadInput {
  name?: string | null;
  phone?: string | null;
  instagram_user_id?: string | null;
  email?: string | null;
  source: Channel;
  intent?: string | null;
  stage?: Stage;
  temperature?: Temperature;
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
  temperature?: Temperature;
  score?: number;
  automation_mode?: AutomationMode;
  assigned_user_id?: string | null;
  lost_reason?: string | null;
}

export interface LeadFilterParams {
  stage?: Stage;
  temperature?: Temperature;
  source?: Channel;
  automation_mode?: AutomationMode;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LeadProfileData {
  transaction_type?: string | null;
  property_type?: string | null;
  city?: string | null;
  neighborhoods?: string[];
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking_spaces?: number | null;
  pet_required?: boolean | null;
  move_date?: string | null;
  rental_guarantee?: string | null;
  financing_interest?: boolean | null;
  qualification_complete?: boolean;
}

export interface ActivityData {
  activity_type: "NOTE" | "CALL" | "VISIT" | "STAGE_CHANGE" | "MESSAGE";
  description: string;
  metadata?: Record<string, unknown>;
  profile_id?: string | null;
}

export interface Lead360View {
  lead: LeadRow;
  profile: LeadProfileData | null;
  stageHistory: Array<{
    id: string;
    from_stage: Stage | null;
    to_stage: Stage;
    reason: string | null;
    created_at: string;
  }>;
  activities: Array<{
    id: string;
    activity_type: string;
    description: string;
    created_at: string;
  }>;
  recentMessages: MessageRow[];
}

export interface DashboardMetrics {
  totalLeads: number;
  leadsByStage: Record<Stage, number>;
  leadsByTemperature: Record<Temperature, number>;
  leadsByAutomation: Record<AutomationMode, number>;
  activeConversations: number;
  scheduledVisits: number;
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
        temperature,
        score,
        automation_mode,
        assigned_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'NEW'), COALESCE($9, 'COLD'), COALESCE($10, 0), COALESCE($11, 'AI'), $12)
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
      input.temperature ?? null,
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

  async listWithFilters(
    ctx: TenantContext,
    filters: LeadFilterParams,
  ): Promise<{ leads: LeadRow[]; total: number }> {
    assertTenantContext(ctx);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;

    if (filters.stage) {
      conditions.push(`stage = $${idx++}`);
      params.push(filters.stage);
    }
    if (filters.temperature) {
      conditions.push(`temperature = $${idx++}`);
      params.push(filters.temperature);
    }
    if (filters.source) {
      conditions.push(`source = $${idx++}`);
      params.push(filters.source);
    }
    if (filters.automation_mode) {
      conditions.push(`automation_mode = $${idx++}`);
      params.push(filters.automation_mode);
    }
    if (filters.search) {
      conditions.push(
        `(name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx} OR intent ILIKE $${idx})`,
      );
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereClause = conditions.join(" AND ");
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM leads WHERE ${whereClause};`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count || "0", 10);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const dataSql = `
      SELECT * FROM leads
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const dataRes = await query<LeadRow>(dataSql, params);
    return { leads: dataRes.rows, total };
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
    if (input.temperature !== undefined) {
      fields.push(`temperature = $${index++}`);
      params.push(input.temperature);
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
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *;
    `;

    const result = await query<LeadRow>(sql, params);
    return result.rows[0] || null;
  }

  async findLead360(ctx: TenantContext, leadId: string): Promise<Lead360View | null> {
    assertTenantContext(ctx);

    const lead = await this.findById(ctx, leadId);
    if (!lead) return null;

    // Profile
    const profileRes = await query<LeadProfileData>(
      `SELECT * FROM lead_profiles WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1;`,
      [leadId, ctx.tenantId],
    );

    // Stage History
    const historyRes = await query<{
      id: string;
      from_stage: Stage | null;
      to_stage: Stage;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT id, from_stage, to_stage, reason, created_at FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC;`,
      [leadId, ctx.tenantId],
    );

    // Activities
    const actRes = await query<{
      id: string;
      activity_type: string;
      description: string;
      created_at: string;
    }>(
      `SELECT id, activity_type, description, created_at FROM activities WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 30;`,
      [leadId, ctx.tenantId],
    );

    // Messages
    const msgRes = await query<MessageRow>(
      `SELECT * FROM messages WHERE lead_id = $1 AND tenant_id = $2 ORDER BY sent_at ASC LIMIT 100;`,
      [leadId, ctx.tenantId],
    );

    return {
      lead,
      profile: profileRes.rows[0] || null,
      stageHistory: historyRes.rows,
      activities: actRes.rows,
      recentMessages: msgRes.rows,
    };
  }

  async upsertProfile(
    ctx: TenantContext,
    leadId: string,
    data: LeadProfileData,
  ): Promise<LeadProfileData> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO lead_profiles (
        tenant_id,
        lead_id,
        transaction_type,
        property_type,
        city,
        neighborhoods,
        min_budget,
        max_budget,
        bedrooms,
        bathrooms,
        parking_spaces,
        pet_required,
        rental_guarantee,
        financing_interest,
        qualification_complete,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
      ON CONFLICT (tenant_id, lead_id) DO UPDATE SET
        transaction_type = EXCLUDED.transaction_type,
        property_type = EXCLUDED.property_type,
        city = EXCLUDED.city,
        neighborhoods = EXCLUDED.neighborhoods,
        min_budget = EXCLUDED.min_budget,
        max_budget = EXCLUDED.max_budget,
        bedrooms = EXCLUDED.bedrooms,
        bathrooms = EXCLUDED.bathrooms,
        parking_spaces = EXCLUDED.parking_spaces,
        pet_required = EXCLUDED.pet_required,
        rental_guarantee = EXCLUDED.rental_guarantee,
        financing_interest = EXCLUDED.financing_interest,
        qualification_complete = EXCLUDED.qualification_complete,
        updated_at = now()
      RETURNING *;
    `;

    const result = await query<LeadProfileData>(sql, [
      ctx.tenantId,
      leadId,
      data.transaction_type ?? null,
      data.property_type ?? null,
      data.city ?? null,
      data.neighborhoods ?? [],
      data.min_budget ?? null,
      data.max_budget ?? null,
      data.bedrooms ?? null,
      data.bathrooms ?? null,
      data.parking_spaces ?? null,
      data.pet_required ?? null,
      data.rental_guarantee ?? null,
      data.financing_interest ?? null,
      data.qualification_complete ?? false,
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Falha ao salvar perfil do lead.");
    return row;
  }

  async addActivity(
    ctx: TenantContext,
    leadId: string,
    activity: ActivityData,
  ): Promise<{ id: string }> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO activities (
        tenant_id,
        lead_id,
        profile_id,
        activity_type,
        description,
        metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;

    const result = await query<{ id: string }>(sql, [
      ctx.tenantId,
      leadId,
      activity.profile_id ?? null,
      activity.activity_type,
      activity.description,
      JSON.stringify(activity.metadata ?? {}),
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Falha ao registrar atividade.");
    return row;
  }

  async changeStage(
    ctx: TenantContext,
    leadId: string,
    newStage: Stage,
    changedByProfileId?: string | null,
    reason?: string | null,
  ): Promise<LeadRow> {
    assertTenantContext(ctx);

    const currentLead = await this.findById(ctx, leadId);
    if (!currentLead) {
      throw new Error("Lead não encontrado.");
    }

    const fromStage = currentLead.stage;

    // 1. Update lead stage
    const updated = await this.update(ctx, leadId, { stage: newStage });
    if (!updated) throw new Error("Falha ao atualizar estágio do lead.");

    // 2. Log in lead_stage_history
    await query(
      `
      INSERT INTO lead_stage_history (
        tenant_id,
        lead_id,
        from_stage,
        to_stage,
        changed_by_profile_id,
        reason
      ) VALUES ($1, $2, $3, $4, $5, $6);
    `,
      [
        ctx.tenantId,
        leadId,
        fromStage,
        newStage,
        changedByProfileId ?? null,
        reason ?? `Mudança manual de estágio para ${newStage}`,
      ],
    );

    // 3. Log activity
    await this.addActivity(ctx, leadId, {
      activity_type: "STAGE_CHANGE",
      description: `Estágio alterado de ${fromStage} para ${newStage}.`,
      profile_id: changedByProfileId,
    });

    return updated;
  }

  async getDashboardMetrics(ctx: TenantContext): Promise<DashboardMetrics> {
    assertTenantContext(ctx);

    const stageCountsSql = `
      SELECT stage, COUNT(*)::int as count
      FROM leads
      WHERE tenant_id = $1
      GROUP BY stage;
    `;

    const tempCountsSql = `
      SELECT temperature, COUNT(*)::int as count
      FROM leads
      WHERE tenant_id = $1
      GROUP BY temperature;
    `;

    const autoCountsSql = `
      SELECT automation_mode, COUNT(*)::int as count
      FROM leads
      WHERE tenant_id = $1
      GROUP BY automation_mode;
    `;

    const convCountSql = `
      SELECT COUNT(*)::int as count
      FROM conversations
      WHERE tenant_id = $1 AND status = 'OPEN';
    `;

    const visitCountSql = `
      SELECT COUNT(*)::int as count
      FROM visits
      WHERE tenant_id = $1 AND status = 'SCHEDULED';
    `;

    const [stagesRes, tempRes, autoRes, convRes, visitRes] = await Promise.all([
      query<{ stage: Stage; count: number }>(stageCountsSql, [ctx.tenantId]),
      query<{ temperature: Temperature; count: number }>(tempCountsSql, [ctx.tenantId]),
      query<{ automation_mode: AutomationMode; count: number }>(autoCountsSql, [ctx.tenantId]),
      query<{ count: number }>(convCountSql, [ctx.tenantId]),
      query<{ count: number }>(visitCountSql, [ctx.tenantId]),
    ]);

    const defaultStages: Record<Stage, number> = {
      NEW: 0,
      CONTACTED: 0,
      QUALIFYING: 0,
      QUALIFIED: 0,
      VISIT_SCHEDULED: 0,
      VISITED: 0,
      PROPOSAL: 0,
      WON: 0,
      LOST: 0,
      DORMANT: 0,
    };

    const defaultTemp: Record<Temperature, number> = {
      HOT: 0,
      WARM: 0,
      COLD: 0,
    };

    const defaultAuto: Record<AutomationMode, number> = {
      AI: 0,
      HUMAN: 0,
    };

    let totalLeads = 0;
    for (const r of stagesRes.rows) {
      defaultStages[r.stage] = r.count;
      totalLeads += r.count;
    }

    for (const r of tempRes.rows) {
      defaultTemp[r.temperature] = r.count;
    }

    for (const r of autoRes.rows) {
      defaultAuto[r.automation_mode] = r.count;
    }

    return {
      totalLeads,
      leadsByStage: defaultStages,
      leadsByTemperature: defaultTemp,
      leadsByAutomation: defaultAuto,
      activeConversations: convRes.rows[0]?.count || 0,
      scheduledVisits: visitRes.rows[0]?.count || 0,
    };
  }

  async delete(ctx: TenantContext, id: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `DELETE FROM leads WHERE id = $1 AND tenant_id = $2;`;
    const result = await query(sql, [id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
