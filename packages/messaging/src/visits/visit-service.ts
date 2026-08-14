import {
  VisitRepository,
  LeadRepository,
  type VisitRow,
  type TenantContext,
  assertTenantContext,
} from "@nexora/database";
import type { FollowupScheduler } from "../followup/followup-scheduler.js";

export interface ScheduleVisitInput {
  leadId: string;
  propertyId?: string | null;
  assignedUserId?: string | null;
  scheduledAt: string;
  feedback?: string | null;
}

export class VisitService {
  private visitRepo: VisitRepository;
  private leadRepo: LeadRepository;
  private followupScheduler?: FollowupScheduler;

  constructor(dependencies?: {
    visitRepo?: VisitRepository;
    leadRepo?: LeadRepository;
    followupScheduler?: FollowupScheduler;
  }) {
    this.visitRepo = dependencies?.visitRepo || new VisitRepository();
    this.leadRepo = dependencies?.leadRepo || new LeadRepository();
    this.followupScheduler = dependencies?.followupScheduler;
  }

  setFollowupScheduler(scheduler: FollowupScheduler): void {
    this.followupScheduler = scheduler;
  }

  async scheduleVisit(ctx: TenantContext, input: ScheduleVisitInput): Promise<VisitRow> {
    assertTenantContext(ctx);

    const lead = await this.leadRepo.findById(ctx, input.leadId);
    if (!lead) {
      throw new Error("Lead não encontrado para agendamento de visita.");
    }

    // 1. Create visit record
    const visit = await this.visitRepo.create(ctx, input);

    // 2. Advance lead stage to VISIT_SCHEDULED and mark as HOT
    await this.leadRepo.changeStage(
      ctx,
      lead.id,
      "VISIT_SCHEDULED",
      input.assignedUserId,
      `Visita agendada para ${new Date(input.scheduledAt).toLocaleString("pt-BR")}`,
    );

    await this.leadRepo.update(ctx, lead.id, {
      temperature: "HOT",
      assigned_user_id: input.assignedUserId,
    });

    // 3. Log activity
    await this.leadRepo.addActivity(ctx, lead.id, {
      activity_type: "VISIT",
      description: `Visita agendada para ${new Date(input.scheduledAt).toLocaleString("pt-BR")}.`,
      profile_id: input.assignedUserId,
    });

    return visit;
  }

  async rescheduleVisit(
    ctx: TenantContext,
    visitId: string,
    newScheduledAt: string,
    reason?: string,
  ): Promise<VisitRow> {
    assertTenantContext(ctx);

    const visit = await this.visitRepo.findById(ctx, visitId);
    if (!visit) {
      throw new Error("Visita não encontrada.");
    }

    const updated = await this.visitRepo.update(ctx, visitId, {
      scheduledAt: newScheduledAt,
      status: "SCHEDULED",
    });

    if (!updated) throw new Error("Falha ao reagendar visita.");

    await this.leadRepo.addActivity(ctx, visit.lead_id, {
      activity_type: "VISIT",
      description: `Visita reagendada para ${new Date(newScheduledAt).toLocaleString("pt-BR")}.${
        reason ? ` Motivo: ${reason}` : ""
      }`,
    });

    return updated;
  }

  async cancelVisit(ctx: TenantContext, visitId: string, reason: string): Promise<VisitRow> {
    assertTenantContext(ctx);

    const visit = await this.visitRepo.findById(ctx, visitId);
    if (!visit) {
      throw new Error("Visita não encontrada.");
    }

    const updated = await this.visitRepo.update(ctx, visitId, {
      status: "CANCELLED",
      feedback: reason,
    });

    if (!updated) throw new Error("Falha ao cancelar visita.");

    await this.leadRepo.addActivity(ctx, visit.lead_id, {
      activity_type: "NOTE",
      description: `Visita cancelada. Motivo: ${reason}`,
    });

    return updated;
  }

  async completeVisit(
    ctx: TenantContext,
    visitId: string,
    feedback?: string | null,
  ): Promise<{ visit: VisitRow; followupJobScheduled: boolean }> {
    assertTenantContext(ctx);

    const visit = await this.visitRepo.findById(ctx, visitId);
    if (!visit) {
      throw new Error("Visita não encontrada.");
    }

    // 1. Mark visit as COMPLETED
    const updated = await this.visitRepo.update(ctx, visitId, {
      status: "COMPLETED",
      feedback: feedback ?? visit.feedback,
    });

    if (!updated) throw new Error("Falha ao concluir visita.");

    // 2. Advance lead stage to VISITED
    await this.leadRepo.changeStage(
      ctx,
      visit.lead_id,
      "VISITED",
      null,
      "Visita realizada com sucesso.",
    );

    // 3. Log activity
    await this.leadRepo.addActivity(ctx, visit.lead_id, {
      activity_type: "VISIT",
      description: `Visita concluída com sucesso.${feedback ? ` Feedback: ${feedback}` : ""}`,
    });

    // 4. CRITICAL DoD REQUIREMENT: Automatically schedule post-visit follow-up (3h delay)
    let followupJobScheduled = false;
    if (this.followupScheduler) {
      const scheduledAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      await this.followupScheduler.scheduleJob(ctx, {
        leadId: visit.lead_id,
        sequenceId: "post_visit",
        scheduledAt,
      });
      followupJobScheduled = true;
    }

    return {
      visit: updated,
      followupJobScheduled,
    };
  }

  async markNoShow(ctx: TenantContext, visitId: string, reason?: string): Promise<VisitRow> {
    assertTenantContext(ctx);

    const visit = await this.visitRepo.findById(ctx, visitId);
    if (!visit) {
      throw new Error("Visita não encontrada.");
    }

    const updated = await this.visitRepo.update(ctx, visitId, {
      status: "NO_SHOW",
      feedback: reason || "Lead não compareceu à visita (No-show).",
    });

    if (!updated) throw new Error("Falha ao registrar no-show.");

    await this.leadRepo.addActivity(ctx, visit.lead_id, {
      activity_type: "NOTE",
      description: `Não comparecimento à visita (No-Show).${reason ? ` Detalhes: ${reason}` : ""}`,
    });

    return updated;
  }

  async recordFeedback(ctx: TenantContext, visitId: string, feedback: string): Promise<VisitRow> {
    assertTenantContext(ctx);

    const updated = await this.visitRepo.update(ctx, visitId, { feedback });
    if (!updated) throw new Error("Visita não encontrada para registro de feedback.");

    await this.leadRepo.addActivity(ctx, updated.lead_id, {
      activity_type: "NOTE",
      description: `Feedback pós-visita registrado: "${feedback}"`,
    });

    return updated;
  }
}
