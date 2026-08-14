import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisitService } from "../visits/visit-service.js";
import { FollowupScheduler } from "../followup/followup-scheduler.js";
import { VisitRepository, LeadRepository, type VisitRow, type LeadRow } from "@nexora/database";

describe("VisitService & Lifecycle (Etapa 7)", () => {
  let service: VisitService;
  let visitRepo: VisitRepository;
  let leadRepo: LeadRepository;
  let followupScheduler: FollowupScheduler;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testLeadId = "lead-visit-100";
  const testVisitId = "visit-500";

  const mockLead: LeadRow = {
    id: testLeadId,
    tenant_id: testTenantId,
    assigned_user_id: null,
    name: "Guilherme Santos",
    phone: "5511977778888",
    instagram_user_id: null,
    email: "guilherme@example.com",
    source: "WHATSAPP",
    intent: "RENTAL_SEARCH",
    stage: "QUALIFIED",
    temperature: "WARM",
    score: 80,
    automation_mode: "AI",
    first_contact_at: new Date().toISOString(),
    last_inbound_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
    next_action_at: null,
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockVisit: VisitRow = {
    id: testVisitId,
    tenant_id: testTenantId,
    lead_id: testLeadId,
    property_id: "prop-123",
    assigned_user_id: "broker-456",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    status: "SCHEDULED",
    feedback: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    visitRepo = new VisitRepository();
    leadRepo = new LeadRepository();
    followupScheduler = new FollowupScheduler();

    service = new VisitService({
      visitRepo,
      leadRepo,
      followupScheduler,
    });
  });

  it("should schedule a visit, advance lead stage to VISIT_SCHEDULED and mark as HOT", async () => {
    leadRepo.findById = vi.fn().mockResolvedValue(mockLead);
    visitRepo.create = vi.fn().mockResolvedValue(mockVisit);
    leadRepo.changeStage = vi.fn().mockResolvedValue({ ...mockLead, stage: "VISIT_SCHEDULED" });
    leadRepo.update = vi.fn().mockResolvedValue({ ...mockLead, temperature: "HOT" });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-1" });

    const visit = await service.scheduleVisit(
      { tenantId: testTenantId },
      {
        leadId: testLeadId,
        propertyId: "prop-123",
        scheduledAt: mockVisit.scheduled_at,
        assignedUserId: "broker-456",
      },
    );

    expect(visit.id).toBe(testVisitId);
    expect(leadRepo.changeStage).toHaveBeenCalledWith(
      { tenantId: testTenantId },
      testLeadId,
      "VISIT_SCHEDULED",
      "broker-456",
      expect.any(String),
    );
    expect(leadRepo.update).toHaveBeenCalledWith(
      { tenantId: testTenantId },
      testLeadId,
      expect.objectContaining({ temperature: "HOT" }),
    );
  });

  it("should reschedule a visit and log activity", async () => {
    const newDate = new Date(Date.now() + 172800000).toISOString();
    visitRepo.findById = vi.fn().mockResolvedValue(mockVisit);
    visitRepo.update = vi.fn().mockResolvedValue({ ...mockVisit, scheduled_at: newDate });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-2" });

    const updated = await service.rescheduleVisit(
      { tenantId: testTenantId },
      testVisitId,
      newDate,
      "Cliente solicitou mudança para domingo",
    );

    expect(updated.scheduled_at).toBe(newDate);
    expect(leadRepo.addActivity).toHaveBeenCalled();
  });

  it("should cancel a visit and record cancel reason", async () => {
    visitRepo.findById = vi.fn().mockResolvedValue(mockVisit);
    visitRepo.update = vi.fn().mockResolvedValue({
      ...mockVisit,
      status: "CANCELLED",
      feedback: "Desistiu do bairro",
    });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-3" });

    const updated = await service.cancelVisit(
      { tenantId: testTenantId },
      testVisitId,
      "Desistiu do bairro",
    );

    expect(updated.status).toBe("CANCELLED");
    expect(leadRepo.addActivity).toHaveBeenCalled();
  });

  // ----------------------------------------------------------------------------
  // CRITICAL DoD TEST (Seção 61):
  // "COMPLETED cria automaticamente o evento correto de pós-visita."
  // ----------------------------------------------------------------------------
  it("CRITICAL DoD: completeVisit should mark COMPLETED, advance stage to VISITED and trigger post_visit follow-up", async () => {
    visitRepo.findById = vi.fn().mockResolvedValue(mockVisit);
    visitRepo.update = vi.fn().mockResolvedValue({ ...mockVisit, status: "COMPLETED" });
    leadRepo.changeStage = vi.fn().mockResolvedValue({ ...mockLead, stage: "VISITED" });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-4" });
    followupScheduler.scheduleJob = vi.fn().mockResolvedValue({
      id: "job-post-visit",
      tenant_id: testTenantId,
      lead_id: testLeadId,
      sequence_id: "post_visit",
    } as any);

    const result = await service.completeVisit(
      { tenantId: testTenantId },
      testVisitId,
      "Cliente adorou a varanda gourmet",
    );

    expect(result.visit.status).toBe("COMPLETED");
    expect(result.followupJobScheduled).toBe(true);
    expect(leadRepo.changeStage).toHaveBeenCalledWith(
      { tenantId: testTenantId },
      testLeadId,
      "VISITED",
      null,
      expect.any(String),
    );
    expect(followupScheduler.scheduleJob).toHaveBeenCalledWith(
      { tenantId: testTenantId },
      expect.objectContaining({
        leadId: testLeadId,
        sequenceId: "post_visit",
        scheduledAt: expect.any(String),
      }),
    );
  });

  it("should mark a visit as NO_SHOW", async () => {
    visitRepo.findById = vi.fn().mockResolvedValue(mockVisit);
    visitRepo.update = vi.fn().mockResolvedValue({ ...mockVisit, status: "NO_SHOW" });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-5" });

    const updated = await service.markNoShow(
      { tenantId: testTenantId },
      testVisitId,
      "Não atendeu na portaria",
    );

    expect(updated.status).toBe("NO_SHOW");
    expect(leadRepo.addActivity).toHaveBeenCalled();
  });

  it("should record feedback on a completed visit", async () => {
    visitRepo.update = vi.fn().mockResolvedValue({
      ...mockVisit,
      feedback: "Quer fazer proposta de R$ 3.200",
    });
    leadRepo.addActivity = vi.fn().mockResolvedValue({ id: "act-6" });

    const updated = await service.recordFeedback(
      { tenantId: testTenantId },
      testVisitId,
      "Quer fazer proposta de R$ 3.200",
    );

    expect(updated.feedback).toContain("proposta");
    expect(leadRepo.addActivity).toHaveBeenCalled();
  });
});
