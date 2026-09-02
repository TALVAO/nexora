import { describe, it, expect } from "vitest";
import {
  assessAvailability,
  resolveAvailabilityPolicy,
  DEFAULT_AVAILABILITY_POLICY,
  type AvailabilityFacts,
} from "./availability.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function facts(overrides: Partial<AvailabilityFacts> = {}): AvailabilityFacts {
  return {
    status: "AVAILABLE",
    verifiedAt: hoursAgo(1),
    source: "AGENT_CONFIRMED",
    ...overrides,
  };
}

describe("assessAvailability — confiança na disponibilidade (Etapa 15.1)", () => {
  // ---------------------------------------------------------------------------
  // TESTE CRÍTICO DA FASE 15
  // "A IA nunca afirma disponibilidade sem verified_at dentro do TTL."
  // ---------------------------------------------------------------------------
  it("TESTE CRÍTICO: só autoriza afirmar disponibilidade com verificação dentro da janela", () => {
    const autorizados = [assessAvailability(facts({ verifiedAt: hoursAgo(1) }), null, NOW)];

    const bloqueados = [
      // Nunca verificado — o caso de todo o catálogo legado.
      assessAvailability(facts({ verifiedAt: null }), null, NOW),
      // Verificado, mas fora da janela fresca.
      assessAvailability(facts({ verifiedAt: hoursAgo(48) }), null, NOW),
      // Verificação vencida.
      assessAvailability(facts({ verifiedAt: hoursAgo(400) }), null, NOW),
      // Carimbo ilegível.
      assessAvailability(facts({ verifiedAt: "não é uma data" }), null, NOW),
      // Carimbo no futuro além da folga de relógio.
      assessAvailability(facts({ verifiedAt: hoursAgo(-5) }), null, NOW),
      // Status diz que não está disponível.
      assessAvailability(facts({ status: "RENTED" }), null, NOW),
    ];

    expect(autorizados.every((a) => a.canAssert)).toBe(true);
    expect(bloqueados.some((a) => a.canAssert)).toBe(false);
  });

  it("classifica FRESH dentro da janela fresca do tenant", () => {
    const result = assessAvailability(facts({ verifiedAt: hoursAgo(6) }), null, NOW);
    expect(result.confidence).toBe("FRESH");
    expect(result.canAssert).toBe(true);
    expect(result.needsReconfirmation).toBe(false);
    expect(result.ageHours).toBe(6);
  });

  it("classifica AGING entre a janela fresca e o prazo de vencimento", () => {
    const result = assessAvailability(facts({ verifiedAt: hoursAgo(72) }), null, NOW);
    expect(result.confidence).toBe("AGING");
    expect(result.canAssert).toBe(false);
    expect(result.needsReconfirmation).toBe(true);
  });

  it("classifica EXPIRED depois do prazo do tenant", () => {
    const result = assessAvailability(facts({ verifiedAt: hoursAgo(200) }), null, NOW);
    expect(result.confidence).toBe("EXPIRED");
    expect(result.canAssert).toBe(false);
    expect(result.needsReconfirmation).toBe(true);
  });

  it("trata a fronteira exata da janela fresca como ainda afirmável", () => {
    const naFronteira = assessAvailability(facts({ verifiedAt: hoursAgo(24) }), null, NOW);
    const umMinutoDepois = assessAvailability(
      facts({ verifiedAt: new Date(NOW.getTime() - 24 * 3_600_000 - 60_000).toISOString() }),
      null,
      NOW,
    );

    expect(naFronteira.confidence).toBe("FRESH");
    expect(umMinutoDepois.confidence).toBe("AGING");
  });

  it("respeita o prazo configurado pelo tenant, não a constante padrão", () => {
    // Imobiliária de alto giro: só confia em verificação da última hora.
    const altoGiro = assessAvailability(
      facts({ verifiedAt: hoursAgo(6) }),
      { freshHours: 1, staleHours: 24 },
      NOW,
    );
    // Carteira estável: uma semana ainda é aceitável para afirmar.
    const carteiraEstavel = assessAvailability(
      facts({ verifiedAt: hoursAgo(6) }),
      { freshHours: 168, staleHours: 720 },
      NOW,
    );

    expect(altoGiro.canAssert).toBe(false);
    expect(carteiraEstavel.canAssert).toBe(true);
  });

  it("nunca afirma disponibilidade de imóvel que não está AVAILABLE, mesmo recém-verificado", () => {
    for (const status of ["RENTED", "SOLD", "RESERVED", "INACTIVE"]) {
      const result = assessAvailability(
        facts({ status, verifiedAt: hoursAgo(0) }),
        null,
        NOW,
      );
      expect(result.confidence).toBe("UNAVAILABLE");
      expect(result.canAssert).toBe(false);
      // Não há o que reconfirmar: o imóvel não está sendo oferecido.
      expect(result.needsReconfirmation).toBe(false);
    }
  });

  it("tolera diferença pequena de relógio entre aplicação e banco", () => {
    // Imóvel confirmado "agora" cujo carimbo do banco ficou alguns minutos à
    // frente do relógio da aplicação: continua fresco, não vira inconsistente.
    const result = assessAvailability(
      facts({ verifiedAt: new Date(NOW.getTime() + 5 * 60_000).toISOString() }),
      null,
      NOW,
    );
    expect(result.confidence).toBe("FRESH");
    expect(result.ageHours).toBe(0);
  });

  it("preserva origem e carimbo no resultado para o corretor auditar", () => {
    const verifiedAt = hoursAgo(3);
    const result = assessAvailability(
      facts({ verifiedAt, source: "XML_FEED" }),
      null,
      NOW,
    );
    expect(result.source).toBe("XML_FEED");
    expect(result.verifiedAt).toBe(new Date(verifiedAt).toISOString());
    expect(result.reason).toContain("3h");
  });
});

describe("resolveAvailabilityPolicy", () => {
  it("cai no padrão quando não há política do tenant", () => {
    expect(resolveAvailabilityPolicy(null)).toEqual(DEFAULT_AVAILABILITY_POLICY);
    expect(resolveAvailabilityPolicy(undefined)).toEqual(DEFAULT_AVAILABILITY_POLICY);
  });

  it("rejeita valores inválidos em vez de produzir janela impossível", () => {
    expect(resolveAvailabilityPolicy({ freshHours: 0 }).freshHours).toBe(24);
    expect(resolveAvailabilityPolicy({ freshHours: -5 }).freshHours).toBe(24);

    // Prazo de vencimento menor que a janela fresca é contraditório.
    const invertido = resolveAvailabilityPolicy({ freshHours: 48, staleHours: 12 });
    expect(invertido.staleHours).toBeGreaterThanOrEqual(invertido.freshHours);
  });
});
