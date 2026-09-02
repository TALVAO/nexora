import { describe, it, expect } from "vitest";
import { summarizeConversation, type ConversationSummaryInput } from "../conversation-summarizer.js";
import type { GeminiClient } from "../gemini-client.js";

/**
 * Mock mínimo do GeminiClient: só precisa ter o formato usado pelo
 * summarizer (isConfigured + generateSummary), não a classe real.
 */
function makeGeminiMock(overrides: {
  isConfigured: boolean;
  generateSummary?: (prompt: string) => Promise<string | null>;
}): GeminiClient {
  return {
    isConfigured: overrides.isConfigured,
    generateSummary: overrides.generateSummary ?? (async () => null),
  } as unknown as GeminiClient;
}

const baseInput: ConversationSummaryInput = {
  leadName: "João",
  agencyName: "Imobiliária Teste",
  profile: {
    transactionType: "RENT",
    propertyType: "Apartamento",
    city: "Jundiaí",
    maxBudget: 3500,
    bedrooms: 2,
  },
  history: [
    { role: "lead", text: "Oi, procuro um apartamento para alugar" },
    { role: "assistant", text: "Claro! Em qual bairro?" },
    { role: "lead", text: "No Centro, até 3500" },
  ],
};

describe("summarizeConversation", () => {
  it("cai para o resumo determinístico quando a IA não está configurada", async () => {
    const gemini = makeGeminiMock({ isConfigured: false });

    const result = await summarizeConversation(baseInput, gemini);

    expect(result.source).toBe("FALLBACK");
    expect(result.text).toContain("Aluguel");
    expect(result.text).toContain("Apartamento");
    expect(result.text).toContain("Jundiaí");
    expect(result.text).toContain("3.500");
    expect(result.text).toContain("No Centro, até 3500");
  });

  it("usa o resumo da IA quando ela retorna um texto válido de 3 linhas", async () => {
    const aiText = "Lead quer alugar apê no Centro.\nJá informou orçamento de 3500.\nFalta confirmar visita.";
    const gemini = makeGeminiMock({
      isConfigured: true,
      generateSummary: async () => aiText,
    });

    const result = await summarizeConversation(baseInput, gemini);

    expect(result.source).toBe("AI");
    expect(result.text).toBe(aiText);
  });

  it("trunca em 3 linhas quando a IA devolve mais de 3 linhas", async () => {
    const aiText = "Linha 1\nLinha 2\nLinha 3\nLinha 4 que não deveria aparecer";
    const gemini = makeGeminiMock({
      isConfigured: true,
      generateSummary: async () => aiText,
    });

    const result = await summarizeConversation(baseInput, gemini);

    expect(result.source).toBe("AI");
    expect(result.text).toBe("Linha 1\nLinha 2\nLinha 3");
    expect(result.text).not.toContain("Linha 4");
  });

  it("cai para o fallback sem propagar erro quando generateSummary lança exceção", async () => {
    const gemini = makeGeminiMock({
      isConfigured: true,
      generateSummary: async () => {
        throw new Error("falha de rede simulada");
      },
    });

    const result = await summarizeConversation(baseInput, gemini);

    expect(result.source).toBe("FALLBACK");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("o fallback nunca lança exceção mesmo sem profile e sem histórico", async () => {
    const gemini = makeGeminiMock({ isConfigured: false });
    const emptyInput: ConversationSummaryInput = {
      leadName: null,
      history: [],
    };

    const result = await summarizeConversation(emptyInput, gemini);

    expect(result.source).toBe("FALLBACK");
    expect(result.text).toBe("Sem informações suficientes para resumir esta conversa ainda.");
  });
});
