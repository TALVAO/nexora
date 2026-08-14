import type { LeadIntent, ExtractedLeadProfile, NextActionDecision } from "./types.js";

export class NextActionPolicy {
  decide(
    intent: LeadIntent,
    profile: ExtractedLeadProfile,
    intentConfidence: number,
  ): NextActionDecision {
    // 1. Guardrail: Opt-out request
    if (intent === "STOP_MESSAGES") {
      return {
        action: "OPT_OUT",
        reason: "Cliente solicitou interrupção de mensagens e descadastramento.",
        confidence: 0.99,
      };
    }

    // 2. Guardrail: Human Takeover (Handoff)
    if (intent === "HUMAN_REQUEST") {
      return {
        action: "HANDOFF_HUMAN",
        handoffReason: "Solicitação explícita do lead para falar com atendente/corretor humano.",
        reason: "Human takeover acionado por pedido direto.",
        confidence: 0.99,
      };
    }

    if (intent === "COMPLAINT") {
      return {
        action: "HANDOFF_HUMAN",
        handoffReason: "Lead registrou reclamação ou insatisfação com o atendimento.",
        reason: "Human takeover acionado por reclamação.",
        confidence: 0.95,
      };
    }

    if (intent === "PRICE_NEGOTIATION") {
      return {
        action: "HANDOFF_HUMAN",
        handoffReason: "Tentativa de negociação comercial de valores/condições do imóvel.",
        reason: "Valores e propostas comerciais exigem intervenção humana.",
        confidence: 0.95,
      };
    }

    if (intentConfidence < 0.6) {
      return {
        action: "HANDOFF_HUMAN",
        handoffReason: "Baixa confiança da IA na interpretação da mensagem.",
        reason: "IA com incerteza na compreensão do lead.",
        confidence: 0.8,
      };
    }

    // 3. Greeting
    if (intent === "GREETING") {
      return {
        action: "GREET",
        questionToAsk:
          "Olá! Como posso te ajudar hoje? Você procura um imóvel para alugar ou comprar?",
        reason: "Saudação inicial acolhedora solicitando tipo de transação.",
        confidence: 0.95,
      };
    }

    // 4. Visit Scheduling / Rescheduling
    if (intent === "SCHEDULE_VISIT" || intent === "RESCHEDULE") {
      return {
        action: "CONFIRM_VISIT",
        questionToAsk: "Com certeza! Para qual dia e horário você prefere agendar a visita?",
        reason: "Coleta de preferência de data e horário para visita.",
        confidence: 0.9,
      };
    }

    if (intent === "CANCEL_VISIT") {
      return {
        action: "CONFIRM_VISIT",
        questionToAsk:
          "Sem problemas. A visita foi desmarcada. Gostaria de remarcar para outra data?",
        reason: "Cancelamento de visita com opção de reagendamento.",
        confidence: 0.9,
      };
    }

    // 5. Missing facts evaluation (Single prioritized question - anti-interrogation)
    if (!profile.transactionType) {
      return {
        action: "ASK_QUESTION",
        questionToAsk: "Você tem interesse em alugar ou comprar o imóvel?",
        reason: "Falta definir o tipo de transação (locação ou compra).",
        confidence: 0.9,
      };
    }

    if (!profile.neighborhoods || profile.neighborhoods.length === 0) {
      return {
        action: "ASK_QUESTION",
        questionToAsk: "Em qual bairro ou região você prefere morar?",
        reason: "Falta identificar a localização/bairro de preferência.",
        confidence: 0.9,
      };
    }

    if (!profile.bedrooms) {
      return {
        action: "ASK_QUESTION",
        questionToAsk: "De quantos quartos ou dormitórios você precisa?",
        reason: "Falta quantidade de dormitórios desejada.",
        confidence: 0.9,
      };
    }

    if (!profile.maxBudget) {
      return {
        action: "ASK_QUESTION",
        questionToAsk:
          profile.transactionType === "RENT"
            ? "Qual o valor máximo de aluguel (com condomínio) pretendido por mês?"
            : "Qual a sua faixa de investimento máxima pretendida para a compra?",
        reason: "Falta faixa de orçamento/investimento do lead.",
        confidence: 0.9,
      };
    }

    // When all essentials are known -> suggest properties or next step
    return {
      action: "SUGGEST_PROPERTY",
      reason:
        "Critérios essenciais coletados (transação, bairro, quartos e orçamento). Pronto para apresentação de imóveis.",
      confidence: 0.95,
    };
  }
}
