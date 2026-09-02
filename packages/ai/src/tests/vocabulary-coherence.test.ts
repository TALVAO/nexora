import { describe, it, expect } from "vitest";
import { IntentClassifier } from "../intent-classifier.js";
import { NextActionPolicy } from "../next-action-policy.js";
import { ConversationEngine } from "../conversation-engine.js";
import {
  DEFAULT_PROPERTY_TYPES,
  DEFAULT_RENTAL_GUARANTEES,
  normalizeTerm,
  type TenantVocabulary,
} from "@nexora/shared";

const SEM_GEOGRAFIA: TenantVocabulary = {
  cities: [],
  neighborhoods: [],
  propertyTypes: DEFAULT_PROPERTY_TYPES,
  rentalGuarantees: DEFAULT_RENTAL_GUARANTEES,
};

const COM_GEOGRAFIA: TenantVocabulary = {
  cities: [{ canonical: "Recife", normalized: "recife", aliases: [] }],
  neighborhoods: [
    {
      canonical: "Boa Viagem",
      normalized: "boa viagem",
      aliases: [],
      parentCityNormalized: "recife",
    },
  ],
  propertyTypes: DEFAULT_PROPERTY_TYPES,
  rentalGuarantees: DEFAULT_RENTAL_GUARANTEES,
};

describe("Coerência entre classificador e extrator (Etapa 13.3)", () => {
  const classifier = new IntentClassifier();

  it("garantia cadastrada pelo tenant também é entendida pelo classificador", () => {
    const comGarantti: TenantVocabulary = {
      ...SEM_GEOGRAFIA,
      rentalGuarantees: [
        ...DEFAULT_RENTAL_GUARANTEES,
        { canonical: "Garantti", aliases: [normalizeTerm("garantti"), "garanti"] },
      ],
    };

    // Sem o vocabulário do tenant, o termo não significa nada.
    expect(classifier.classify("vocês aceitam Garantti?").intent).not.toBe("DOCUMENTATION");

    // Com o vocabulário, o classificador e o extrator enxergam a mesma coisa.
    expect(classifier.classify("vocês aceitam Garantti?", comGarantti).intent).toBe(
      "DOCUMENTATION",
    );
  });

  it("garantias do mercado seguem reconhecidas sem cadastro nenhum", () => {
    expect(classifier.classify("preciso de fiador?").intent).toBe("DOCUMENTATION");
    expect(classifier.classify("aceita caução?").intent).toBe("DOCUMENTATION");
  });

  it("visita vale para qualquer tipo de imóvel, não só apartamento", () => {
    // Antes, só "ir ver o apartamento" disparava agendamento.
    expect(classifier.classify("quero ver a casa").intent).toBe("SCHEDULE_VISIT");
    expect(classifier.classify("posso ver o terreno?").intent).toBe("SCHEDULE_VISIT");
    expect(classifier.classify("quero ver o apartamento").intent).toBe("SCHEDULE_VISIT");
  });

  it("tipo de imóvel do tenant também dispara busca", () => {
    const comChacara: TenantVocabulary = {
      ...SEM_GEOGRAFIA,
      propertyTypes: [
        ...DEFAULT_PROPERTY_TYPES,
        { canonical: "Rancho", aliases: ["rancho", "ranchinho"] },
      ],
    };

    expect(classifier.classify("procuro um rancho", comChacara).intent).toBe("RENTAL_SEARCH");
  });
});

describe("Guarda contra laço de qualificação (Etapa 13.3)", () => {
  const policy = new NextActionPolicy();
  const engine = new ConversationEngine();

  const perfilSemBairro = {
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

  it("com geografia cadastrada, perguntar o bairro é legítimo", () => {
    const decisao = policy.decide("RENTAL_SEARCH", perfilSemBairro, 0.9, { hasGeography: true });
    expect(decisao.action).toBe("ASK_QUESTION");
    expect(decisao.questionToAsk).toContain("bairro");
  });

  it("TESTE CRÍTICO: sem geografia, não pergunta o que não sabe entender", () => {
    // Se perguntasse, o lead responderia, a extração não reconheceria nada e a
    // mesma pergunta voltaria — laço infinito.
    const decisao = policy.decide("RENTAL_SEARCH", perfilSemBairro, 0.9, { hasGeography: false });

    expect(decisao.action).not.toBe("ASK_QUESTION");
    expect(decisao.action).toBe("SUGGEST_PROPERTY");
  });

  it("o motor deriva o sinal do vocabulário recebido", () => {
    const base = {
      tenantId: "t1",
      leadId: "l1",
      conversationId: "c1",
      lastMessageText: "quero alugar apartamento de 2 quartos até 3 mil",
    };

    const semGeo = engine.processMessage({ ...base, vocabulary: SEM_GEOGRAFIA });
    expect(semGeo.response.nextAction.action).toBe("SUGGEST_PROPERTY");

    const comGeo = engine.processMessage({ ...base, vocabulary: COM_GEOGRAFIA });
    expect(comGeo.response.nextAction.action).toBe("ASK_QUESTION");
    expect(comGeo.response.nextAction.questionToAsk).toContain("bairro");
  });
});
