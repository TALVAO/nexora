import { describe, it, expect, vi, beforeEach } from "vitest";
import { FollowupScheduler } from "../followup/followup-scheduler.js";
import {
  FollowupRepository,
  LeadRepository,
  type FollowupJobRow,
  type LeadRow,
} from "@nexora/database";

describe("Follow-up Engine & Scheduler (Etapa 6)", () => {
  let scheduler: FollowupScheduler;
  let followupRepo: FollowupRepository;
  let leadRepo: LeadRepository;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testLeadId = "lead-followup-123";

  const mockLead: LeadRow = {
    id: testLeadId,
    tenant_id: testTenantId,
    assigned_user_id: null,
    name: "Ana Paula",
    phone: "5511988887777",
    instagram_user_id: null,
    email: "ana@example.com",
    source: "WHATSAPP",
    intent: "RENTAL_SEARCH",
    stage: "QUALIFYING",
    temperature: "WARM",
    score: 50,
    automation_mode: "AI",
    first_contact_at: new Date("2026-08-14T10:00:00Z").toISOString(),
    last_inbound_at: new Date("2026-08-14T10:00:00Z").toISOString(),
    last_outbound_at: new Date("2026-08-14T10:02:00Z").toISOString(),
    next_action_at: null,
    lost_reason: null,
    created_at: new Date("2026-08-14T10:00:00Z").toISOString(),
    updated_at: new Date("2026-08-14T10:02:00Z").toISOString(),
  };

  const mockJob: FollowupJobRow = {
    id: "job-100",
    tenant_id: testTenantId,
    lead_id: testLeadId,
    conversation_id: "conv-1",
    sequence_id: "qualification_abandoned",
    step_id: "step-1",
    scheduled_at: new Date("2026-08-14T12:00:00Z").toISOString(),
    status: "PENDING",
    attempts: 0,
    cancel_reason: null,
    blocked_reason: null,
    provider_message_id: null,
    locked_at: null,
    locked_by: null,
    created_at: new Date("2026-08-14T10:05:00Z").toISOString(),
    updated_at: new Date("2026-08-14T10:05:00Z").toISOString(),
    executed_at: null,
  };

  beforeEach(() => {
    followupRepo = new FollowupRepository();
    followupRepo.checkLeadOptOut = vi.fn().mockResolvedValue(false);
    followupRepo.countRecentSentFollowups = vi.fn().mockResolvedValue(0);
    leadRepo = new LeadRepository();
    scheduler = new FollowupScheduler({ followupRepo, leadRepo });
  });

  describe("Stop Conditions Verification", () => {
    // --------------------------------------------------------------------------
    // TESTE CRÍTICO OBRIGATÓRIO (DoD):
    // "Um follow-up jamais é enviado se o lead respondeu antes do horário."
    // --------------------------------------------------------------------------
    it("CRITICAL: should CANCEL followup if lead replied after the job was created", async () => {
      // Lead responded at 10:30 (after job was created at 10:05)
      const leadReplied: LeadRow = {
        ...mockLead,
        last_inbound_at: new Date("2026-08-14T10:30:00Z").toISOString(),
      };

      leadRepo.findById = vi.fn().mockResolvedValue(leadReplied);

      const decision = await scheduler.evaluateStopConditions({ tenantId: testTenantId }, mockJob);

      expect(decision.shouldStop).toBe(true);
      expect(decision.action).toBe("CANCEL");
      expect(decision.reason).toContain("Lead respondeu antes do horário agendado");
    });

    it("should CANCEL followup if lead stage is WON", async () => {
      const wonLead: LeadRow = {
        ...mockLead,
        stage: "WON",
      };
      leadRepo.findById = vi.fn().mockResolvedValue(wonLead);

      const decision = await scheduler.evaluateStopConditions({ tenantId: testTenantId }, mockJob);

      expect(decision.shouldStop).toBe(true);
      expect(decision.action).toBe("CANCEL");
      expect(decision.reason).toContain("WON");
    });

    it("should CANCEL followup if lead stage is LOST", async () => {
      const lostLead: LeadRow = {
        ...mockLead,
        stage: "LOST",
      };
      leadRepo.findById = vi.fn().mockResolvedValue(lostLead);

      const decision = await scheduler.evaluateStopConditions({ tenantId: testTenantId }, mockJob);

      expect(decision.shouldStop).toBe(true);
      expect(decision.action).toBe("CANCEL");
      expect(decision.reason).toContain("LOST");
    });

    it("should BLOCK followup if lead is under HUMAN takeover mode", async () => {
      const humanLead: LeadRow = {
        ...mockLead,
        automation_mode: "HUMAN",
      };
      leadRepo.findById = vi.fn().mockResolvedValue(humanLead);

      const decision = await scheduler.evaluateStopConditions({ tenantId: testTenantId }, mockJob);

      expect(decision.shouldStop).toBe(true);
      expect(decision.action).toBe("BLOCK");
      expect(decision.reason).toContain("HUMAN");
    });

    it("should PROCEED with followup if lead has not replied and is qualifying", async () => {
      // Lead last inbound was before job creation
      leadRepo.findById = vi.fn().mockResolvedValue(mockLead);

      const decision = await scheduler.evaluateStopConditions({ tenantId: testTenantId }, mockJob);

      expect(decision.shouldStop).toBe(false);
      expect(decision.action).toBe("PROCEED");
    });
  });

  describe("Queue Execution Pipeline", () => {
    it("should process due jobs and cancel ones that met stop conditions", async () => {
      // 1 job that should be cancelled (lead replied)
      const dueJob: FollowupJobRow = {
        ...mockJob,
        status: "PROCESSING",
      };

      const leadReplied: LeadRow = {
        ...mockLead,
        last_inbound_at: new Date("2026-08-14T11:00:00Z").toISOString(),
      };

      followupRepo.lockDueJobs = vi.fn().mockResolvedValue([dueJob]);
      leadRepo.findById = vi.fn().mockResolvedValue(leadReplied);
      followupRepo.cancelJob = vi.fn().mockResolvedValue(true);

      const stats = await scheduler.processDueJobs({ tenantId: testTenantId }, "worker-1");

      expect(stats.processed).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.sent).toBe(0);
      expect(followupRepo.cancelJob).toHaveBeenCalledWith(
        { tenantId: testTenantId },
        "job-100",
        expect.stringContaining("Lead respondeu"),
      );
    });

    it("should process due jobs and mark sent if all stop conditions pass", async () => {
      const dueJob: FollowupJobRow = {
        ...mockJob,
        status: "PROCESSING",
      };

      followupRepo.lockDueJobs = vi.fn().mockResolvedValue([dueJob]);
      leadRepo.findById = vi.fn().mockResolvedValue(mockLead);
      followupRepo.markJobSent = vi.fn().mockResolvedValue(true);

      const stats = await scheduler.processDueJobs({ tenantId: testTenantId }, "worker-1");

      expect(stats.processed).toBe(1);
      expect(stats.sent).toBe(1);
      expect(stats.cancelled).toBe(0);
      expect(followupRepo.markJobSent).toHaveBeenCalled();
    });
  });
});
