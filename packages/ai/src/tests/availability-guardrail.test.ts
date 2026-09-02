import { describe, it, expect } from "vitest";
import { assessAvailability, type AvailabilityAssessment } from "@nexora/domain";
import { ResponseGenerator } from "../response-generator.js";
import type { ExtractedLeadProfile, NextActionDecision } from "../types.js";

/**
 * TESTE CRÍTICO DA FASE 15 (plano de evolução):
 *
 *   "A IA nunca afirma disponibilidade sem verified_at dentro do TTL."
 *
 * Este arquivo protege a fronteira onde o texto de fato sai para o lead. A
 * regra em si vive em `@nexora/domain`; aqui se prova que o gerador de resposta
 * obedece a ela — inclusive no caso mais perigoso, que é o padrão: **nenhuma
 * informação de disponibilidade foi passada**.
 */

const NOW = new Date("2026-09-01T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function fresh(): AvailabilityAssessment {
  return assessAvailability(
    { status: "AVAILABLE", verifiedAt: hoursAgo(2), source: "AGENT_CONFIRMED" },
    null,
    NOW,
  );
}

function stale(): AvailabilityAssessment {
  return assessAvailability(
    { status: "AVAILABLE", verifiedAt: hoursAgo(400), source: "XML_FEED" },
    null,
    NOW,
  );
}

function neverVerified(): AvailabilityAssessment {
  return assessAvailability(
    { status: "AVAILABLE", verifiedAt: null, source: "MANUAL" },
    null,
    NOW,
  );
}

const PROFILE: ExtractedLeadProfile = {
  transactionType: "RENT",
  bedrooms: 2,
  maxBudget: 2500,
  neighborhoods: ["Centro"],
};

const SUGGEST: NextActionDecision = {
  action: "SUGGEST_PROPERTY",
  reason: "Perfil qualificado",
  confidence: 0.9,
};

const ASK: NextActionDecision = {
  action: "ASK_QUESTION",
  questionToAsk: "Quantos quartos você procura?",
  reason: "Faltam dados",
  confidence: 0.8,
};

/** Qualquer frase que declare estoque/disponibilidade como fato. */
const AFFIRMA_DISPONIBILIDADE =
  /est[áa] dispon[íi]vel|opç(ões|ao) dispon[íi]ve|imóveis dispon[íi]veis|ainda est[áa] livre|continua dispon[íi]vel/i;

describe("Guardrail de disponibilidade na resposta ao lead (Etapa 15.1)", () => {
  const generator = new ResponseGenerator();

  // ---------------------------------------------------------------------------
  // TESTE CRÍTICO
  // ---------------------------------------------------------------------------
  it("TESTE CRÍTICO: não afirma disponibilidade quando não há verificação dentro do TTL", () => {
    const cenariosSemVerificacaoValida = [
      // O caso padrão hoje: o pipeline não passa nada.
      undefined,
      // Lista vazia — nenhum imóvel avaliado.
      [],
      // Nunca verificado (todo o catálogo legado, migration 05).
      [neverVerified()],
      // Verificação vencida.
      [stale()],
      // Basta UM imóvel duvidoso na lista para a frase não poder sair.
      [fresh(), stale()],
    ];

    for (const availability of cenariosSemVerificacaoValida) {
      const respostaPerguntaDireta = generator.generate({
        intent: "PROPERTY_QUESTION",
        profile: PROFILE,
        decision: ASK,
        lastMessageText: "esse apartamento ainda está disponível?",
        availability,
      });

      const respostaSugestao = generator.generate({
        intent: "RENTAL_SEARCH",
        profile: PROFILE,
        decision: SUGGEST,
        lastMessageText: "quero alugar um apto de 2 quartos até 2500",
        availability,
      });

      expect(respostaPerguntaDireta).not.toMatch(AFFIRMA_DISPONIBILIDADE);
      expect(respostaSugestao).not.toMatch(AFFIRMA_DISPONIBILIDADE);
    }
  });

  it("promete retorno em vez de negar quando o lead pergunta e não há verificação fresca", () => {
    const resposta = generator.generate({
      intent: "PROPERTY_QUESTION",
      profile: PROFILE,
      decision: ASK,
      lastMessageText: "oi, o apto da rua tal ainda está disponível?",
      availability: [stale()],
    });

    // Não inventa nem fecha a porta: compromete-se a confirmar. É esse gancho
    // que o Availability Check Loop (Etapa 15.3) vai destravar.
    expect(resposta).toMatch(/confirmar a disponibilidade/i);
    expect(resposta).toMatch(/retorno/i);
  });

  it("afirma disponibilidade quando a verificação está dentro da janela do tenant", () => {
    const resposta = generator.generate({
      intent: "PROPERTY_QUESTION",
      profile: PROFILE,
      decision: ASK,
      lastMessageText: "esse imóvel ainda está disponível?",
      availability: [fresh()],
    });

    expect(resposta).toMatch(/sim, está dispon[íi]vel/i);
  });

  it("reconhece as várias formas de o lead perguntar sobre disponibilidade", () => {
    const perguntas = [
      "ainda está disponível?",
      "esse imóvel ainda tem?",
      "já foi alugado?",
      "já alugaram esse?",
      "continua livre?",
      "esse apartamento ainda está disponivel",
    ];

    for (const pergunta of perguntas) {
      const resposta = generator.generate({
        intent: "PROPERTY_QUESTION",
        profile: PROFILE,
        decision: ASK,
        lastMessageText: pergunta,
        availability: [neverVerified()],
      });

      expect(resposta).toMatch(/confirmar a disponibilidade/i);
    }
  });

  it("mantém o resumo do perfil na sugestão, mudando só a promessa de estoque", () => {
    const semVerificacao = generator.generate({
      intent: "RENTAL_SEARCH",
      profile: PROFILE,
      decision: SUGGEST,
      lastMessageText: "quero alugar",
    });

    const comVerificacao = generator.generate({
      intent: "RENTAL_SEARCH",
      profile: PROFILE,
      decision: SUGGEST,
      lastMessageText: "quero alugar",
      availability: [fresh()],
    });

    // O lead continua sendo reconhecido nas duas versões...
    for (const resposta of [semVerificacao, comVerificacao]) {
      expect(resposta).toMatch(/locação/i);
      expect(resposta).toMatch(/2 quartos/);
      expect(resposta).toMatch(/Centro/);
    }

    // ...e só a versão verificada promete opções disponíveis.
    expect(comVerificacao).toMatch(AFFIRMA_DISPONIBILIDADE);
    expect(semVerificacao).not.toMatch(AFFIRMA_DISPONIBILIDADE);
    expect(semVerificacao).toMatch(/confirmando a disponibilidade/i);
  });
});
