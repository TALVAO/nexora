import type { IntentClassificationResult } from "./types.js";

export class IntentClassifier {
  classify(text: string): IntentClassificationResult {
    const raw = text.trim().toLowerCase();

    // 1. STOP_MESSAGES / OPT-OUT (Highest safety priority)
    if (
      /^(pare|parar|sair|descadastrar|cancelar mensagens|opt out|stop|não quero mais|nao quero mais)$/i.test(
        raw,
      ) ||
      /\b(não quero receber|nao quero receber|descadastre|pare de mandar|parar mensagens)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "STOP_MESSAGES",
        confidence: 0.99,
        explanation: "Identificada intenção explícita de opt-out/parada de mensagens.",
      };
    }

    // 2. HUMAN_REQUEST / HUMAN TAKEOVER
    if (
      /\b(falar com atendente|falar com humano|pessoa de verdade|atendente humano|quero falar com alguém|corretor humano|chama o corretor|falar com um humano|falar com uma pessoa)\b/i.test(
        raw,
      ) ||
      /^(humano|atendente|pessoa)$/i.test(raw)
    ) {
      return {
        intent: "HUMAN_REQUEST",
        confidence: 0.98,
        explanation: "Solicitação explícita de transferência para atendente humano.",
      };
    }

    // 3. COMPLAINT / RECLAMAÇÃO
    if (
      /\b(reclamação|reclamar|péssimo|horrível|não apareceu|desrespeito|falta de compromisso|falta de respeito|processar|absurdo|fiquei esperando)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "COMPLAINT",
        confidence: 0.95,
        explanation: "Expressão de insatisfação ou reclamação de serviço.",
      };
    }

    // 4. PRICE_NEGOTIATION / NEGOCIAÇÃO
    if (
      /\b(desconto|abaixa|fazer por|faz por|negociar|negociação|consegue diminuir|pagar adiantado|aceita proposta|proposta de)\b/i.test(
        raw,
      ) ||
      /\b(faz \d+|consegue fazer por \d+)\b/i.test(raw)
    ) {
      return {
        intent: "PRICE_NEGOTIATION",
        confidence: 0.92,
        explanation: "Tentativa de negociação comercial ou pedido de desconto.",
      };
    }

    // 5. CANCEL_VISIT
    if (
      /\b(cancelar visita|cancela a visita|não vou conseguir ir|nao vou conseguir ir|não posso mais ir|cancela o agendamento)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "CANCEL_VISIT",
        confidence: 0.94,
        explanation: "Solicitação de cancelamento de visita.",
      };
    }

    // 6. RESCHEDULE
    if (
      /\b(remarcar|reagendar|mudar o horário|mudar o dia|trocar o horário|outro horário para visita)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "RESCHEDULE",
        confidence: 0.93,
        explanation: "Solicitação de reagendamento de visita.",
      };
    }

    // 7. SCHEDULE_VISIT
    if (
      /\b(agendar visita|marcar visita|visitar|conhecer o imóvel|ir ver o apartamento|quando posso ver|visita amanhã|visita sábado)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "SCHEDULE_VISIT",
        confidence: 0.92,
        explanation: "Interesse em agendamento de visita.",
      };
    }

    // 8. DOCUMENTATION / GARANTIA
    if (
      /\b(documentos|documentação|comprovante de renda|fiador|caução|seguro fiança|garantia locatícia|credpago|depósito caução)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "DOCUMENTATION",
        confidence: 0.9,
        explanation: "Dúvidas sobre documentos ou garantias locatícias.",
      };
    }

    // 9. PROPERTY_QUESTION (Questions about structure, dimensions, price, fees, rules)
    if (
      /\b(quantos metros|metragem|área útil|tem vaga|aceita pet|aceita cachorro|qual o valor|condomínio|iptu|andar|sol da manhã|piscina|sacada|varanda|espessura|parede|preço|preco|quanto custa|valor)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "PROPERTY_QUESTION",
        confidence: 0.88,
        explanation: "Dúvida sobre características, valores ou detalhes do imóvel.",
      };
    }

    // 10. GREETING
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|opa|e aí|e ai|oie)$/i.test(raw)) {
      return {
        intent: "GREETING",
        confidence: 0.95,
        explanation: "Saudação inicial simples.",
      };
    }

    // 11. Preference switch (e.g. "prefiro comprar em vez de alugar", "tava querendo comprar mas agora vou alugar")
    if (
      /\b(prefiro comprar|em vez de alugar|ao invés de alugar|mudei de ideia.*comprar|agora quero comprar)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "PURCHASE_SEARCH",
        confidence: 0.95,
        explanation: "Mudança de preferência ou intenção expressa para compra.",
      };
    }

    if (
      /\b(prefiro alugar|em vez de comprar|ao invés de comprar|mudei de ideia.*alugar|agora vou alugar)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "RENTAL_SEARCH",
        confidence: 0.95,
        explanation: "Mudança de preferência ou intenção expressa para locação.",
      };
    }

    // 12. RENTAL_SEARCH vs PURCHASE_SEARCH general
    const hasRentKeywords = /\b(alugar|locação|locacao|aluguel|alugo|alugando)\b/i.test(raw);
    const hasBuyKeywords = /\b(comprar|compra|venda|compro|adquirir|financiamento)\b/i.test(raw);

    if (hasRentKeywords && !hasBuyKeywords) {
      return {
        intent: "RENTAL_SEARCH",
        confidence: 0.95,
        explanation: "Busca de imóvel para locação.",
      };
    }

    if (hasBuyKeywords && !hasRentKeywords) {
      return {
        intent: "PURCHASE_SEARCH",
        confidence: 0.95,
        explanation: "Busca de imóvel para compra/venda.",
      };
    }

    // 13. General search expressions ("lugar pra morar", "procurando imóvel", "casa", "apartamento")
    if (
      /\b(lugar|morar|família|familia|quarto|quartos|dormitório|dormitórios|casa|apartamento|apto|kitnet|bairro|reais|mil|imóvel|imovel)\b/i.test(
        raw,
      )
    ) {
      return {
        intent: "RENTAL_SEARCH",
        confidence: 0.85,
        explanation: "Interesse em busca de moradia/imóvel.",
      };
    }

    // 14. OTHER
    return {
      intent: "OTHER",
      confidence: 0.65,
      explanation: "Mensagem genérica ou não categorizada.",
    };
  }
}
