import { describe, it, expect, beforeEach } from "vitest";
import { ConversationEngine } from "../conversation-engine.js";
import { IntentClassifier } from "../intent-classifier.js";
import { StructuredExtractor } from "../structured-extractor.js";
import { NextActionPolicy } from "../next-action-policy.js";
import type { AIExecutionContext } from "../types.js";

describe("Conversation Engine & Mandatory AI Test Dataset (Etapa 4)", () => {
  let engine: ConversationEngine;
  let classifier: IntentClassifier;
  let extractor: StructuredExtractor;
  let policy: NextActionPolicy;

  const baseCtx: AIExecutionContext = {
    tenantId: "tenant-001",
    leadId: "lead-001",
    conversationId: "conv-001",
    lastMessageText: "",
  };

  beforeEach(() => {
    engine = new ConversationEngine();
    classifier = new IntentClassifier();
    extractor = new StructuredExtractor();
    policy = new NextActionPolicy();
  });

  // 1. Lead Direto
  it("1. Lead Direto: extracts full criteria and suggests properties", () => {
    const text = "Busco apto de 2 quartos no Eloy Chaves para alugar até 3500";
    const { response, aiRun } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("RENTAL_SEARCH");
    expect(response.extractedProfile.transactionType).toBe("RENT");
    expect(response.extractedProfile.propertyType).toBe("Apartamento");
    expect(response.extractedProfile.bedrooms).toBe(2);
    expect(response.extractedProfile.neighborhoods).toContain("Eloy Chaves");
    expect(response.extractedProfile.maxBudget).toBe(3500);
    expect(response.nextAction.action).toBe("SUGGEST_PROPERTY");
    expect(response.shouldHandoff).toBe(false);
    expect(aiRun.intent).toBe("RENTAL_SEARCH");
  });

  // 2. Lead Confuso
  it("2. Lead Confuso: asks transaction type politely without crashing", () => {
    const text = "Oi, então, tô vendo aí um lugar bom pra morar com a família mas não sei direito";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.nextAction.action).toBe("ASK_QUESTION");
    expect(response.shouldHandoff).toBe(false);
    expect(response.text).toContain("alugar ou comprar");
  });

  // 3. Lead que muda de ideia
  it("3. Lead que muda de ideia: switches from rent to buy", () => {
    const text = "Na verdade mudei de ideia, prefiro comprar em vez de alugar";
    const initialProfile = { transactionType: "RENT" as const, bedrooms: 3 };
    const { response } = engine.processMessage({
      ...baseCtx,
      lastMessageText: text,
      currentProfile: initialProfile,
    });

    expect(response.intent).toBe("PURCHASE_SEARCH");
    expect(response.extractedProfile.transactionType).toBe("BUY");
    expect(response.extractedProfile.bedrooms).toBe(3);
  });

  // 4. Compra -> Locação
  it("4. Compra -> Locação: switches intent to rent", () => {
    const text = "Tava querendo comprar mas agora vou alugar";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("RENTAL_SEARCH");
    expect(response.extractedProfile.transactionType).toBe("RENT");
  });

  // 5. Locação -> Venda
  it("5. Locação -> Venda: switches intent to buy and captures property type", () => {
    const text = "Prefiro comprar uma casa agora";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("PURCHASE_SEARCH");
    expect(response.extractedProfile.transactionType).toBe("BUY");
    expect(response.extractedProfile.propertyType).toBe("Casa");
  });

  // 6. Mensagem Curta
  it("6. Mensagem Curta: handles greeting and single word questions gracefully", () => {
    const { response: resGreeting } = engine.processMessage({ ...baseCtx, lastMessageText: "Oi" });
    expect(resGreeting.intent).toBe("GREETING");
    expect(resGreeting.nextAction.action).toBe("GREET");

    const { response: resPrice } = engine.processMessage({ ...baseCtx, lastMessageText: "Preço?" });
    expect(resPrice.nextAction.action).toBe("ASK_QUESTION");
  });

  // 7. Áudio Transcrito
  it("7. Áudio Transcrito: extracts search criteria from speech transcription", () => {
    const text =
      "olá boa tarde eu tava querendo saber se tem casa disponível no retiro com garagem";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.extractedProfile.propertyType).toBe("Casa");
    expect(response.extractedProfile.neighborhoods).toContain("Retiro");
    expect(response.extractedProfile.parkingSpaces).toBe(1);
  });

  // 8. Orçamento com Texto
  it("8. Orçamento com Texto: parses spoken numbers like '4 mil e quinhentos'", () => {
    const text = "meu limite é uns 4 mil e quinhentos por mês";
    const extraction = extractor.extract(text);

    expect(extraction.profile.maxBudget).toBe(4500);
  });

  // 9. Bairro Múltiplo
  it("9. Bairro Múltiplo: captures multiple neighborhoods into array", () => {
    const text = "Pode ser no Centro, Vila Arens ou Jardim do Trevo";
    const extraction = extractor.extract(text);

    expect(extraction.profile.neighborhoods).toContain("Centro");
    expect(extraction.profile.neighborhoods).toContain("Vila Arens");
    expect(extraction.profile.neighborhoods).toContain("Jardim do Trevo");
  });

  // 10. Lead Pede Humano
  it("10. Lead Pede Humano: triggers immediate handoff to human", () => {
    const text = "Gostaria de falar com uma pessoa de verdade";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("HUMAN_REQUEST");
    expect(response.shouldHandoff).toBe(true);
    expect(response.nextAction.action).toBe("HANDOFF_HUMAN");
    expect(response.text).toContain("corretores especialistas");
  });

  // 11. Reclamação
  it("11. Reclamação: triggers immediate priority handoff to human", () => {
    const text = "O corretor não apareceu na visita, péssimo atendimento";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("COMPLAINT");
    expect(response.shouldHandoff).toBe(true);
    expect(response.nextAction.action).toBe("HANDOFF_HUMAN");
    expect(response.text).toContain("Lamentamos muito");
  });

  // 12. Negociação
  it("12. Negociação: triggers handoff for broker approval", () => {
    const text = "Consegue fazer por 2.500 se eu pagar adiantado?";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("PRICE_NEGOTIATION");
    expect(response.shouldHandoff).toBe(true);
    expect(response.nextAction.action).toBe("HANDOFF_HUMAN");
  });

  // 13. Pergunta Inexistente na Base
  it("13. Pergunta Inexistente na Base: does not hallucinate and acknowledges uncertainty", () => {
    const text = "Qual a espessura da parede do quarto dos fundos?";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("PROPERTY_QUESTION");
    expect(response.text).toContain("Vou confirmar esse detalhe diretamente com o corretor");
    expect(response.text).not.toContain("A parede tem");
  });

  // 14. Opt-Out / Stop Messages
  it("14. Opt-Out: recognizes stop command and confirms unsubscription", () => {
    const text = "Por favor pare de mandar mensagens";
    const { response } = engine.processMessage({ ...baseCtx, lastMessageText: text });

    expect(response.intent).toBe("STOP_MESSAGES");
    expect(response.nextAction.action).toBe("OPT_OUT");
    expect(response.text).toContain("descadastrado com sucesso");
  });
});
