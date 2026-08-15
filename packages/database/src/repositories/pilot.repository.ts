import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";

export interface PilotMetrics {
  tenantId: string;
  period: { from: string; to: string };
  aiRunsCount: number;
  aiErrorsCount: number;
  unansweredQuestionsCount: number;
  lostLeadsCount: number;
  lostReasons: Record<string, number>;
  handoffsCount: number;
  followupsSentCount: number;
  followupsCancelledCount: number;
  visitsScheduledCount: number;
  visitsCompletedCount: number;
  estimatedSavedMinutes: number;
  activeLeadsCount: number;
}

export interface RecordIncidentInput {
  leadId?: string | null;
  incidentType:
    "AI_HALLUCINATION" | "UNANSWERED_QUESTION" | "WRONG_STAGE" | "MISSED_FOLLOWUP" | "OTHER";
  description: string;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface PilotIncidentRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  incident_type: string;
  description: string;
  expected_behavior: string | null;
  actual_behavior: string | null;
  severity: string;
  created_at: string;
}

export class PilotRepository {
  /**
   * Calcula as métricas operacionais diárias do piloto real (Seção 65 do Plano Mestre).
   */
  async getDailyMetrics(
    ctx: TenantContext,
    dateRange?: { from?: string; to?: string },
  ): Promise<PilotMetrics> {
    assertTenantContext(ctx);

    const from = dateRange?.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = dateRange?.to || new Date().toISOString();

    // 1. Execuções de IA
    const aiRunsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM ai_runs WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const aiRunsCount = aiRunsRes.rows[0]?.count || 0;

    // 2. Incidentes / Erros da IA
    const incidentsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM activities WHERE tenant_id = $1 AND activity_type = 'PILOT_INCIDENT' AND created_at >= $2 AND created_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const aiErrorsCount = incidentsRes.rows[0]?.count || 0;

    // 3. Perguntas não respondidas / Dúvidas gerais
    const unansweredRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM leads WHERE tenant_id = $1 AND intent IN ('GENERAL_QUESTION', 'UNKNOWN') AND created_at >= $2 AND created_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const unansweredQuestionsCount = unansweredRes.rows[0]?.count || 0;

    // 4. Leads Perdidos e motivos
    const lostRes = await query<{ lost_reason: string | null; count: number }>(
      `SELECT COALESCE(lost_reason, 'Não informado') as lost_reason, count(*)::int as count FROM leads WHERE tenant_id = $1 AND stage = 'LOST' AND updated_at >= $2 AND updated_at <= $3 GROUP BY lost_reason;`,
      [ctx.tenantId, from, to],
    );
    let lostLeadsCount = 0;
    const lostReasons: Record<string, number> = {};
    for (const r of lostRes.rows) {
      lostReasons[r.lost_reason || "Não informado"] = r.count;
      lostLeadsCount += r.count;
    }

    // 5. Handoffs para atendimento humano
    const handoffsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM leads WHERE tenant_id = $1 AND automation_mode = 'HUMAN' AND updated_at >= $2 AND updated_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const handoffsCount = handoffsRes.rows[0]?.count || 0;

    // 6. Follow-ups enviados vs cancelados
    const followupsSentRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM followup_jobs WHERE tenant_id = $1 AND status = 'SENT' AND updated_at >= $2 AND updated_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const followupsSentCount = followupsSentRes.rows[0]?.count || 0;

    const followupsCancelledRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM followup_jobs WHERE tenant_id = $1 AND status = 'CANCELLED' AND updated_at >= $2 AND updated_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const followupsCancelledCount = followupsCancelledRes.rows[0]?.count || 0;

    // 7. Visitas agendadas e concluídas
    const visitsScheduledRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM visits WHERE tenant_id = $1 AND status = 'SCHEDULED' AND created_at >= $2 AND created_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const visitsScheduledCount = visitsScheduledRes.rows[0]?.count || 0;

    const visitsCompletedRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM visits WHERE tenant_id = $1 AND status = 'COMPLETED' AND updated_at >= $2 AND updated_at <= $3;`,
      [ctx.tenantId, from, to],
    );
    const visitsCompletedCount = visitsCompletedRes.rows[0]?.count || 0;

    // 8. Leads ativos no momento
    const activeLeadsRes = await query<{ count: number }>(
      `SELECT count(*)::int as count FROM leads WHERE tenant_id = $1 AND stage NOT IN ('LOST', 'WON', 'DORMANT');`,
      [ctx.tenantId],
    );
    const activeLeadsCount = activeLeadsRes.rows[0]?.count || 0;

    // 9. Cálculo de tempo economizado (5 min por qualificação IA + 3 min por follow-up automático enviado + 5 min por visita agendada)
    const estimatedSavedMinutes =
      aiRunsCount * 5 + followupsSentCount * 3 + visitsScheduledCount * 5;

    return {
      tenantId: ctx.tenantId,
      period: { from, to },
      aiRunsCount,
      aiErrorsCount,
      unansweredQuestionsCount,
      lostLeadsCount,
      lostReasons,
      handoffsCount,
      followupsSentCount,
      followupsCancelledCount,
      visitsScheduledCount,
      visitsCompletedCount,
      estimatedSavedMinutes,
      activeLeadsCount,
    };
  }

  /**
   * Registra um incidente ou observação diária do piloto real.
   */
  async recordIncident(
    ctx: TenantContext,
    incident: RecordIncidentInput,
  ): Promise<{ id: string; recordedAt: string }> {
    assertTenantContext(ctx);

    const description = `[${incident.incidentType}] ${incident.description}${
      incident.actualBehavior ? ` | Observado: ${incident.actualBehavior}` : ""
    }${incident.expectedBehavior ? ` | Esperado: ${incident.expectedBehavior}` : ""}`;

    const sql = `
      INSERT INTO activities (
        tenant_id,
        lead_id,
        activity_type,
        description,
        metadata_json
      ) VALUES ($1, $2, 'PILOT_INCIDENT', $3, $4)
      RETURNING id, created_at;
    `;

    const metadata = {
      incidentType: incident.incidentType,
      severity: incident.severity || "MEDIUM",
      expectedBehavior: incident.expectedBehavior,
      actualBehavior: incident.actualBehavior,
    };

    const result = await query<{ id: string; created_at: string }>(sql, [
      ctx.tenantId,
      incident.leadId || null,
      description,
      JSON.stringify(metadata),
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Falha ao registrar incidente de piloto.");

    return {
      id: row.id,
      recordedAt: row.created_at,
    };
  }

  /**
   * Lista os incidentes reportados no piloto.
   */
  async listIncidents(ctx: TenantContext, limit = 50): Promise<PilotIncidentRow[]> {
    assertTenantContext(ctx);

    const sql = `
      SELECT
        id,
        tenant_id,
        lead_id,
        (metadata_json->>'incidentType') as incident_type,
        description,
        (metadata_json->>'expectedBehavior') as expected_behavior,
        (metadata_json->>'actualBehavior') as actual_behavior,
        COALESCE(metadata_json->>'severity', 'MEDIUM') as severity,
        created_at
      FROM activities
      WHERE tenant_id = $1 AND activity_type = 'PILOT_INCIDENT'
      ORDER BY created_at DESC
      LIMIT $2;
    `;

    const result = await query<PilotIncidentRow>(sql, [ctx.tenantId, limit]);
    return result.rows;
  }
}
