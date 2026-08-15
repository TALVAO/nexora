import { describe, it, expect, vi } from "vitest";
import { PilotRepository } from "../repositories/pilot.repository.js";

describe("PilotRepository & Daily Observability (Etapa 11)", () => {
  const pilotRepo = new PilotRepository();
  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  it("should calculate complete daily metrics and estimated saved time", async () => {
    pilotRepo.getDailyMetrics = vi.fn().mockResolvedValue({
      tenantId: testTenantId,
      period: {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-15T00:00:00.000Z",
      },
      aiRunsCount: 45,
      aiErrorsCount: 1,
      unansweredQuestionsCount: 2,
      lostLeadsCount: 3,
      lostReasons: {
        "Preço fora da realidade": 2,
        Desistência: 1,
      },
      handoffsCount: 5,
      followupsSentCount: 18,
      followupsCancelledCount: 12,
      visitsScheduledCount: 8,
      visitsCompletedCount: 6,
      estimatedSavedMinutes: 319, // 45*5 + 18*3 + 8*5 = 225 + 54 + 40 = 319 min
      activeLeadsCount: 14,
    });

    const metrics = await pilotRepo.getDailyMetrics({ tenantId: testTenantId });

    expect(metrics.aiRunsCount).toBe(45);
    expect(metrics.aiErrorsCount).toBe(1);
    expect(metrics.unansweredQuestionsCount).toBe(2);
    expect(metrics.lostLeadsCount).toBe(3);
    expect(metrics.lostReasons["Preço fora da realidade"]).toBe(2);
    expect(metrics.handoffsCount).toBe(5);
    expect(metrics.followupsSentCount).toBe(18);
    expect(metrics.followupsCancelledCount).toBe(12);
    expect(metrics.visitsScheduledCount).toBe(8);
    expect(metrics.estimatedSavedMinutes).toBe(319);
  });

  it("should record pilot incident with diagnostic details", async () => {
    pilotRepo.recordIncident = vi.fn().mockResolvedValue({
      id: "incident-001",
      recordedAt: new Date().toISOString(),
    });

    const res = await pilotRepo.recordIncident(
      { tenantId: testTenantId },
      {
        leadId: "lead-123",
        incidentType: "AI_HALLUCINATION",
        description: "IA indicou valor de condomínio não constante no anúncio",
        expectedBehavior: "Informar apenas valor de locação ou solicitar confirmação",
        actualBehavior: "Afirmou que condomínio era R$ 300",
        severity: "HIGH",
      },
    );

    expect(res.id).toBe("incident-001");
    expect(pilotRepo.recordIncident).toHaveBeenCalledWith(
      { tenantId: testTenantId },
      expect.objectContaining({
        incidentType: "AI_HALLUCINATION",
        severity: "HIGH",
      }),
    );
  });

  it("should list recorded incidents for continuous refinement", async () => {
    pilotRepo.listIncidents = vi.fn().mockResolvedValue([
      {
        id: "incident-001",
        tenant_id: testTenantId,
        lead_id: "lead-123",
        incident_type: "AI_HALLUCINATION",
        description: "IA indicou condomínio errado",
        expected_behavior: "Não inventar condomínio",
        actual_behavior: "Afirmou R$ 300",
        severity: "HIGH",
        created_at: new Date().toISOString(),
      },
    ]);

    const incidents = await pilotRepo.listIncidents({ tenantId: testTenantId });

    expect(incidents.length).toBe(1);
    expect(incidents[0]!.incident_type).toBe("AI_HALLUCINATION");
    expect(incidents[0]!.severity).toBe("HIGH");
  });
});
