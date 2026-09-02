import type { AvailabilityAssessment } from "@nexora/domain";
import type { LeadIntent, ExtractedLeadProfile, NextActionDecision } from "./types.js";

export interface ResponseGenerationInput {
  intent: LeadIntent;
  profile: ExtractedLeadProfile;
  decision: NextActionDecision;
  lastMessageText: string;
  agencyName?: string;
  isUnknownQuestion?: boolean;
  /**
   * Avaliação de disponibilidade dos imóveis que esta resposta pode citar
   * (Etapa 15.1). Vazio ou ausente = nenhuma disponibilidade verificada, e
   * portanto **nenhuma frase afirmativa de disponibilidade pode sair**.
   */
  availability?: AvailabilityAssessment[];
}

/**
 * Frase usada sempre que o lead toca em disponibilidade e o sistema não tem
 * verificação fresca. É deliberadamente um compromisso de retorno, não uma
 * negativa: é exatamente ela que o Availability Check Loop (Etapa 15.3) vai
 * destravar quando o corretor responder.
 */
const RECONFIRMATION_REPLY =
  "Vou confirmar a disponibilidade agora mesmo com o corretor responsável e já te retorno com a resposta certa.";

export class ResponseGenerator {
  /**
   * Regra de ouro da Fase 15 (CLAUDE.md §23): só é permitido afirmar
   * disponibilidade quando existe pelo menos um imóvel avaliado e **todos** os
   * avaliados estão dentro da janela de verificação do tenant. Sem lista, sem
   * afirmação — fail closed.
   */
  private canAssertAvailability(input: ResponseGenerationInput): boolean {
    const assessments = input.availability;
    if (!assessments || assessments.length === 0) return false;
    return assessments.every((assessment) => assessment.canAssert);
  }

  generate(input: ResponseGenerationInput): string {
    const { intent, decision, profile, lastMessageText } = input;

    // 1. Opt-out
    if (decision.action === "OPT_OUT") {
      return "Você foi descadastrado com sucesso e não receberá mais mensagens automáticas. Caso queira retomar o contato no futuro, basta nos mandar uma mensagem por aqui!";
    }

    // 2. Handoff to human
    if (decision.action === "HANDOFF_HUMAN") {
      if (intent === "PRICE_NEGOTIATION") {
        return "Compreendo a sua proposta de valor! Como negociações comerciais dependem de aprovação com o proprietário, estou direcionando seu contato para um de nossos corretores especialistas falar com você.";
      }
      if (intent === "COMPLAINT") {
        return "Lamentamos muito pelo transtorno ocorrido. Estou encaminhando imediatamente esta conversa para o nosso responsável de atendimento para resolver a sua situação com máxima prioridade.";
      }
      return "Perfeito! Estou transferindo seu atendimento agora mesmo para um de nossos corretores especialistas continuar essa conversa com você. Um instante!";
    }

    // 3. Greeting
    if (decision.action === "GREET") {
      return "Olá! Tudo bem? Sou o assistente virtual da imobiliária. Você está procurando um imóvel para alugar ou para comprar?";
    }

    // 4. Questions with unverified facts / Property questions
    if (intent === "PROPERTY_QUESTION") {
      // Pergunta direta de disponibilidade: o pior erro comercial possível é
      // responder "está disponível" sobre imóvel já alugado e mandar o lead
      // marcar visita. Sem verificação fresca, o sistema promete retorno.
      if (
        /dispon[íi]vel|ainda (est[áa]|tem)|foi alugado|j[áa] (alugou|alugaram|vendeu|venderam)|continua (livre|vago)/i.test(
          lastMessageText,
        )
      ) {
        if (!this.canAssertAvailability(input)) {
          return RECONFIRMATION_REPLY;
        }
        return (
          "Sim, está disponível! " +
          (decision.questionToAsk || "Quer que eu já veja um horário de visita para você?")
        );
      }

      // Check if asking about unverified condo rules or specific characteristics
      if (
        /espessura|estrutura|fiação|quadro de luz|antigo morador|vizinhança|parede/i.test(
          lastMessageText,
        )
      ) {
        return "Essa é uma pergunta bem específica sobre o imóvel! Vou confirmar esse detalhe diretamente com o corretor responsável e te retorno em breve.";
      }

      if (/aceita pet|aceita cachorro|animais/i.test(lastMessageText)) {
        return (
          "A maioria dos nossos imóveis aceita pets, mas confirmamos sempre a regra do condomínio para você. " +
          (decision.questionToAsk || "Quantos quartos você procura?")
        );
      }

      if (/condom[íi]nio|iptu|taxas/i.test(lastMessageText)) {
        return (
          "Os valores de condomínio e IPTU variam conforme cada unidade cadastrada. " +
          (decision.questionToAsk || "Em qual bairro você prefere?")
        );
      }
    }

    // 5. Visit Confirmation
    if (decision.action === "CONFIRM_VISIT") {
      return (
        decision.questionToAsk ||
        "Perfeito! Qual o melhor dia e horário para agendarmos a sua visita?"
      );
    }

    // 6. Suggest Property / Qualification Complete
    if (decision.action === "SUGGEST_PROPERTY") {
      const transText = profile.transactionType === "BUY" ? "compra" : "locação";
      const nbText =
        profile.neighborhoods && profile.neighborhoods.length > 0
          ? `no ${profile.neighborhoods.join(", ")}`
          : "";
      const bedroomsText = profile.bedrooms ? `de ${profile.bedrooms} quartos` : "";
      const budgetText = profile.maxBudget
        ? `até R$ ${profile.maxBudget.toLocaleString("pt-BR")}`
        : "";

      const perfil =
        `Excelente! Entendi que você procura um imóvel para ${transText} ${bedroomsText} ${nbText} ${budgetText}.`.replace(
          /\s+/g,
          " ",
        );

      // "opções disponíveis" é uma afirmação de disponibilidade. Ela só pode
      // sair quando existe verificação fresca por trás (Etapa 15.1); caso
      // contrário a frase promete uma checagem em vez de garantir estoque.
      return this.canAssertAvailability(input)
        ? `${perfil} Já estou separando as melhores opções disponíveis com esse perfil para te apresentar.`
        : `${perfil} Já estou levantando as melhores opções com esse perfil e confirmando a disponibilidade de cada uma antes de te apresentar.`;
    }

    // 7. General Questions
    if (decision.questionToAsk) {
      return decision.questionToAsk;
    }

    return "Como posso te ajudar na busca do seu imóvel ideal hoje?";
  }
}
