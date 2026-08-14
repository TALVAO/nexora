import {
  FollowupRepository,
  LeadRepository,
  type FollowupJobRow,
  type TenantContext,
  assertTenantContext,
} from "@nexora/database";
import type { MessageGateway } from "../gateway/message-gateway.js";

export interface StopConditionResult {
  shouldStop: boolean;
  action: "PROCEED" | "CANCEL" | "BLOCK";
  reason?: string;
}

export interface ScheduleFollowupInput {
  leadId: string;
  conversationId?: string | null;
  sequenceId?: string | null;
  stepId?: string | null;
  scheduledAt: string;
}

export class FollowupScheduler {
  private followupRepo: FollowupRepository;
  private leadRepo: LeadRepository;
  private messageGateway?: MessageGateway;

  constructor(dependencies?: {
    followupRepo?: FollowupRepository;
    leadRepo?: LeadRepository;
    messageGateway?: MessageGateway;
  }) {
    this.followupRepo = dependencies?.followupRepo || new FollowupRepository();
    this.leadRepo = dependencies?.leadRepo || new LeadRepository();
    this.messageGateway = dependencies?.messageGateway;
  }

  setMessageGateway(gateway: MessageGateway): void {
    this.messageGateway = gateway;
  }

  async scheduleJob(ctx: TenantContext, input: ScheduleFollowupInput): Promise<FollowupJobRow> {
    assertTenantContext(ctx);
    return this.followupRepo.createJob(ctx, input);
  }

  async cancelJobsForLead(ctx: TenantContext, leadId: string, reason: string): Promise<number> {
    assertTenantContext(ctx);
    return this.followupRepo.cancelJobsForLead(ctx, leadId, reason);
  }

  async evaluateStopConditions(
    ctx: TenantContext,
    job: FollowupJobRow,
  ): Promise<StopConditionResult> {
    assertTenantContext(ctx);

    const lead = await this.leadRepo.findById(ctx, job.lead_id);
    if (!lead) {
      return {
        shouldStop: true,
        action: "CANCEL",
        reason: "Lead não encontrado ou removido do tenant.",
      };
    }

    // 1. CRITICAL STOP CONDITION: Lead respondeu após a criação do job de follow-up
    if (lead.last_inbound_at && new Date(lead.last_inbound_at) > new Date(job.created_at)) {
      return {
        shouldStop: true,
        action: "CANCEL",
        reason: "Lead respondeu antes do horário agendado do follow-up.",
      };
    }

    // 2. Lead virou WON (Fechado)
    if (lead.stage === "WON") {
      return {
        shouldStop: true,
        action: "CANCEL",
        reason: "Lead atingiu estágio WON (Negócio Fechado).",
      };
    }

    // 3. Lead virou LOST (Perdido Definitivo)
    if (lead.stage === "LOST") {
      return {
        shouldStop: true,
        action: "CANCEL",
        reason: "Lead atingiu estágio LOST (Perdido Definitivo).",
      };
    }

    // 4. Atendimento Humano assumido (Human takeover ativo)
    if (lead.automation_mode === "HUMAN") {
      return {
        shouldStop: true,
        action: "BLOCK",
        reason: "Atendimento em modo HUMAN assumido por corretor.",
      };
    }

    // 5. Opt-out registrado em consent_preferences
    const isOptedOut = await this.followupRepo.checkLeadOptOut(ctx, lead.id);
    if (isOptedOut) {
      return {
        shouldStop: true,
        action: "BLOCK",
        reason: "Lead solicitou descadastro e opt-out de comunicações.",
      };
    }

    // 6. Visita já agendada para sequências pré-visita
    if (
      (lead.stage === "VISIT_SCHEDULED" || lead.stage === "VISITED") &&
      job.sequence_id === "qualification_abandoned"
    ) {
      return {
        shouldStop: true,
        action: "CANCEL",
        reason: "Visita já agendada ou realizada pelo lead.",
      };
    }

    // 7. Limite de Frequência (Frequency Cap: máx 3 follow-ups nos últimos 7 dias)
    const sentCount = await this.followupRepo.countRecentSentFollowups(ctx, lead.id, 7);
    if (sentCount >= 3) {
      return {
        shouldStop: true,
        action: "BLOCK",
        reason: "Limite de frequência semanal atingido (máximo de 3 mensagens a cada 7 dias).",
      };
    }

    return {
      shouldStop: false,
      action: "PROCEED",
    };
  }

  async processDueJobs(
    ctx: TenantContext,
    workerId = "default-worker",
  ): Promise<{
    processed: number;
    sent: number;
    cancelled: number;
    blocked: number;
    failed: number;
  }> {
    assertTenantContext(ctx);

    const dueJobs = await this.followupRepo.lockDueJobs(ctx, workerId);
    let sent = 0;
    let cancelled = 0;
    let blocked = 0;
    let failed = 0;

    for (const job of dueJobs) {
      try {
        const check = await this.evaluateStopConditions(ctx, job);

        if (check.action === "CANCEL") {
          await this.followupRepo.cancelJob(ctx, job.id, check.reason || "Stop condition acionada");
          cancelled++;
          continue;
        }

        if (check.action === "BLOCK") {
          await this.followupRepo.blockJob(ctx, job.id, check.reason || "Bloqueio operacional");
          blocked++;
          continue;
        }

        // Action is PROCEED -> Dispatch Message
        if (this.messageGateway && job.conversation_id) {
          const lead = await this.leadRepo.findById(ctx, job.lead_id);
          const name = lead?.name || "Olá";
          const followupText = `Olá ${name}! Tudo bem? Surgiram novas opções com o perfil que você estava buscando. Gostaria de dar uma olhada?`;

          const sendResult = await this.messageGateway.sendOutbound(ctx, job.conversation_id, {
            text: followupText,
            senderType: "SYSTEM",
          });

          if (sendResult.success) {
            await this.followupRepo.markJobSent(
              ctx,
              job.id,
              sendResult.message?.external_message_id,
            );
            sent++;
          } else {
            await this.followupRepo.incrementJobAttempts(ctx, job.id);
            failed++;
          }
        } else {
          // Simulation / Test fallback when gateway not wired
          await this.followupRepo.markJobSent(ctx, job.id, `sim_out_${Date.now()}`);
          sent++;
        }
      } catch {
        await this.followupRepo.incrementJobAttempts(ctx, job.id);
        failed++;
      }
    }

    return {
      processed: dueJobs.length,
      sent,
      cancelled,
      blocked,
      failed,
    };
  }
}
