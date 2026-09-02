import { describe, it, expect } from "vitest";
import { StructuredExtractor } from "../structured-extractor.js";
import { IntentClassifier } from "../intent-classifier.js";
import { NextActionPolicy } from "../next-action-policy.js";
import { ConversationEngine } from "../conversation-engine.js";
import {
  DEFAULT_PROPERTY_TYPES,
  DEFAULT_RENTAL_GUARANTEES,
  mergeVocabularyTerms,
  matchVocabularyTerm,
  propertyTypesMatch,
  normalizeTerm,
  type TenantVocabulary,
  type LocationTerm,
} from "@nexora/shared";

/**
 * Regressões encontradas na verificação adversarial da Etapa 13.3.
 *
 * Cada caso aqui é um defeito que EXISTIU e foi corrigido. Não remova: são a
 * prova de que a correção continua valendo (CLAUDE.md §48).
 */

const extractor = new StructuredExtractor();
const classifier = new IntentClassifier();
const policy = new NextActionPolicy();
const engine = new ConversationEngine();

function loc(name: string, parentCity?: string): LocationTerm {
  return {
    canonical: name,
    normalized: normalizeTerm(name),
    aliases: [],
    parentCityNormalized: parentCity ? normalizeTerm(parentCity) : null,
  };
}

const base = {
  propertyTypes: DEFAULT_PROPERTY_TYPES,
  rentalGuarantees: DEFAULT_RENTAL_GUARANTEES,
};

describe("Regressões corrigidas na Etapa 13.3", () => {
  // --------------------------------------------------------------------------
  describe("1. Alias curto e polissêmico contaminava a extração", () => {
    it("'área de serviço' não vira Terreno", () => {
      expect(extractor.extract("quero alugar algo com área de serviço").profile.propertyType).toBe(
        null,
      );
    });

    it("'área de lazer' e 'área gourmet' não viram Terreno", () => {
      expect(extractor.extract("tem área de lazer?").profile.propertyType).toBe(null);
      expect(extractor.extract("procuro com área gourmet").profile.propertyType).toBe(null);
    });

    it("terreno de verdade continua sendo reconhecido", () => {
      expect(extractor.extract("quero comprar um terreno").profile.propertyType).toBe("Terreno");
      expect(extractor.extract("tem lote à venda?").profile.propertyType).toBe("Terreno");
    });
  });

  // --------------------------------------------------------------------------
  describe("2. Pedido de visita com dia da semana", () => {
    it("funciona para qualquer dia, não só o plantão do primeiro cliente", () => {
      for (const dia of ["sábado", "segunda", "terça", "quinta", "domingo", "hoje"]) {
        expect(classifier.classify(`podemos fazer a visita ${dia} de manhã?`).intent).toBe(
          "SCHEDULE_VISIT",
        );
      }
    });

    it("continua entendendo o pedido sem dia marcado", () => {
      expect(classifier.classify("quero agendar visita").intent).toBe("SCHEDULE_VISIT");
      expect(classifier.classify("quero ver a casa").intent).toBe("SCHEDULE_VISIT");
    });
  });

  // --------------------------------------------------------------------------
  describe("3. Pergunta sobre o imóvel não vira agendamento", () => {
    it("'quero ver a casa, qual o valor?' é pergunta, não visita", () => {
      expect(classifier.classify("Quero ver a casa que tem no site, qual o valor?").intent).toBe(
        "PROPERTY_QUESTION",
      );
    });

    it("'quero ver a casa, quanto custa o condomínio?' também", () => {
      expect(classifier.classify("quero ver a casa, quanto custa o condomínio?").intent).toBe(
        "PROPERTY_QUESTION",
      );
    });
  });

  // --------------------------------------------------------------------------
  describe("4. Termo do tenant cadastrado sem alias", () => {
    it("o próprio canônico serve de forma reconhecível", () => {
      const merged = mergeVocabularyTerms(DEFAULT_PROPERTY_TYPES, [
        { canonical: "Cabana", aliases: [] },
      ]);
      const match = matchVocabularyTerm(normalizeTerm("quero uma cabana"), merged);
      expect(match?.canonical).toBe("Cabana");
    });

    it("sobrescrever um canônico não apaga o reconhecimento dele", () => {
      const merged = mergeVocabularyTerms(DEFAULT_PROPERTY_TYPES, [
        { canonical: "Kitnet/Studio", aliases: [] },
      ]);
      const match = matchVocabularyTerm(normalizeTerm("procuro uma kitnet"), merged);
      expect(match?.canonical).toBe("Kitnet/Studio");
    });
  });

  // --------------------------------------------------------------------------
  describe("5. Casamento de tipo entre catálogo e perfil", () => {
    it("'Studio' do CRM casa com 'Kitnet/Studio' do extrator", () => {
      expect(propertyTypesMatch("Studio", "Kitnet/Studio")).toBe(true);
    });

    it("'Casa em Condomínio' casa com 'Casa'", () => {
      expect(propertyTypesMatch("Casa em Condomínio", "Casa")).toBe(true);
      expect(propertyTypesMatch("Casa em Condominio", "Casa")).toBe(true);
    });

    it("tipos diferentes continuam não casando", () => {
      expect(propertyTypesMatch("Apartamento", "Casa")).toBe(false);
      expect(propertyTypesMatch("Terreno", "Cobertura")).toBe(false);
    });

    it("valor ausente não casa com nada", () => {
      expect(propertyTypesMatch("", "Casa")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe("6. Guarda de geografia olha bairros, não cidades", () => {
    const perfil = {
      transactionType: "RENT" as const,
      propertyType: "Apartamento",
      city: null,
      neighborhoods: [],
      maxBudget: 3000,
      bedrooms: 2,
      parkingSpaces: null,
      hasPet: null,
      moveDate: null,
      rentalGuarantee: null,
      notes: null,
    };

    it("tenant só com cidades não entra no laço da pergunta de bairro", () => {
      const soCidades: TenantVocabulary = {
        ...base,
        cities: [loc("Recife")],
        neighborhoods: [],
      };

      const { response } = engine.processMessage({
        tenantId: "t",
        leadId: "l",
        conversationId: "c",
        lastMessageText: "quero alugar apartamento de 2 quartos até 3 mil",
        vocabulary: soCidades,
      });

      expect(response.nextAction.action).not.toBe("ASK_QUESTION");
    });

    it("tenant com bairros pergunta normalmente", () => {
      const comBairros: TenantVocabulary = {
        ...base,
        cities: [loc("Recife")],
        neighborhoods: [loc("Boa Viagem", "Recife")],
      };

      const decisao = policy.decide("RENTAL_SEARCH", perfil, 0.9, {
        hasGeography: comBairros.neighborhoods.length > 0,
      });
      expect(decisao.questionToAsk).toContain("bairro");
    });
  });

  // --------------------------------------------------------------------------
  describe("7. Falha ao carregar vocabulário não altera o roteiro", () => {
    it("sem vocabulário, a política mantém a pergunta de bairro", () => {
      const { response } = engine.processMessage({
        tenantId: "t",
        leadId: "l",
        conversationId: "c",
        lastMessageText: "quero alugar apartamento de 2 quartos até 3 mil",
      });

      expect(response.nextAction.action).toBe("ASK_QUESTION");
      expect(response.nextAction.questionToAsk).toContain("bairro");
    });
  });

  // --------------------------------------------------------------------------
  describe("8. Cidade ambígua não é inventada", () => {
    const doisCentros: TenantVocabulary = {
      ...base,
      cities: [loc("Jundiaí"), loc("Itupeva")],
      neighborhoods: [loc("Centro", "Jundiaí"), loc("Centro", "Itupeva")],
    };

    it("bairro homônimo em duas cidades não define cidade", () => {
      const { profile } = extractor.extract("quero alugar no centro", undefined, doisCentros);
      expect(profile.neighborhoods).toContain("Centro");
      expect(profile.city).toBeNull();
    });

    it("bairro exclusivo de uma cidade continua definindo a cidade", () => {
      const umCentro: TenantVocabulary = {
        ...base,
        cities: [loc("Jundiaí")],
        neighborhoods: [loc("Centro", "Jundiaí")],
      };
      expect(extractor.extract("quero no centro", undefined, umCentro).profile.city).toBe(
        "Jundiaí",
      );
    });

    it("cidade dita pelo lead prevalece sobre inferência", () => {
      const { profile } = extractor.extract("quero no centro de Itupeva", undefined, doisCentros);
      expect(profile.city).toBe("Itupeva");
    });
  });
});
