import { describe, it, expect } from "vitest";
import { StructuredExtractor } from "../structured-extractor.js";
import {
  DEFAULT_PROPERTY_TYPES,
  DEFAULT_RENTAL_GUARANTEES,
  normalizeTerm,
  type TenantVocabulary,
  type LocationTerm,
} from "@nexora/shared";

function term(name: string, parentCity?: string, aliases: string[] = []): LocationTerm {
  return {
    canonical: name,
    normalized: normalizeTerm(name),
    aliases: aliases.map(normalizeTerm),
    parentCityNormalized: parentCity ? normalizeTerm(parentCity) : null,
  };
}

function vocabularyFor(
  city: string,
  neighborhoods: Array<[string, string[]?]>,
  overrides: Partial<TenantVocabulary> = {},
): TenantVocabulary {
  return {
    cities: [term(city)],
    neighborhoods: neighborhoods.map(([name, aliases]) => term(name, city, aliases)),
    propertyTypes: DEFAULT_PROPERTY_TYPES,
    rentalGuarantees: DEFAULT_RENTAL_GUARANTEES,
    ...overrides,
  };
}

/** Tenant piloto, região de Jundiaí/SP. */
const JUNDIAI = vocabularyFor("Jundiaí", [
  ["Eloy Chaves", ["eloi chaves", "eloy"]],
  ["Anhangabaú"],
  ["Centro"],
]);

/** Outro cliente, outra ponta do país. */
const RECIFE = vocabularyFor("Recife", [["Boa Viagem"], ["Espinheiro"], ["Centro"]]);

describe("Vocabulário por tenant (Etapa 13.3)", () => {
  const extractor = new StructuredExtractor();

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  describe("TESTE CRÍTICO: geografia de um tenant não vaza para outro", () => {
    const textoJundiai = "Quero alugar apartamento no Eloy Chaves";
    const textoRecife = "Quero alugar apartamento em Boa Viagem";

    it("o tenant de Recife NÃO reconhece bairro de Jundiaí", () => {
      const { profile } = extractor.extract(textoJundiai, undefined, RECIFE);

      expect(profile.neighborhoods).toEqual([]);
      expect(profile.city).toBeNull();
      // O resto da extração continua funcionando normalmente.
      expect(profile.propertyType).toBe("Apartamento");
      expect(profile.transactionType).toBe("RENT");
    });

    it("o tenant de Jundiaí NÃO reconhece bairro do Recife", () => {
      const { profile } = extractor.extract(textoRecife, undefined, JUNDIAI);

      expect(profile.neighborhoods).toEqual([]);
      expect(profile.city).toBeNull();
      expect(profile.propertyType).toBe("Apartamento");
    });

    it("cada tenant reconhece a própria geografia", () => {
      const emJundiai = extractor.extract(textoJundiai, undefined, JUNDIAI).profile;
      expect(emJundiai.neighborhoods).toContain("Eloy Chaves");
      expect(emJundiai.city).toBe("Jundiaí");

      const emRecife = extractor.extract(textoRecife, undefined, RECIFE).profile;
      expect(emRecife.neighborhoods).toContain("Boa Viagem");
      expect(emRecife.city).toBe("Recife");
    });

    it("o mesmo nome de bairro resolve para a cidade certa em cada tenant", () => {
      // "Centro" existe nos dois. Cada um resolve para a própria cidade.
      const texto = "Procuro no Centro";

      expect(extractor.extract(texto, undefined, JUNDIAI).profile.city).toBe("Jundiaí");
      expect(extractor.extract(texto, undefined, RECIFE).profile.city).toBe("Recife");
    });
  });

  // --------------------------------------------------------------------------
  describe("Tenant sem geografia cadastrada", () => {
    it("não reconhece bairro nenhum, mas não quebra a extração", () => {
      const { profile } = extractor.extract(
        "Quero alugar apartamento de 2 quartos no Eloy Chaves até 3500 com caução",
      );

      expect(profile.neighborhoods).toEqual([]);
      expect(profile.city).toBeNull();
      // Tudo que não depende de geografia segue extraído.
      expect(profile.transactionType).toBe("RENT");
      expect(profile.propertyType).toBe("Apartamento");
      expect(profile.bedrooms).toBe(2);
      expect(profile.maxBudget).toBe(3500);
      expect(profile.rentalGuarantee).toBe("Caução");
    });
  });

  // --------------------------------------------------------------------------
  describe("Casamento de termos", () => {
    it("aceita a grafia alternativa cadastrada pelo tenant", () => {
      const { profile } = extractor.extract("tem algo no eloi chaves?", undefined, JUNDIAI);
      expect(profile.neighborhoods).toContain("Eloy Chaves");
    });

    it("ignora acento e caixa", () => {
      const { profile } = extractor.extract("QUERO NO ANHANGABAU", undefined, JUNDIAI);
      expect(profile.neighborhoods).toContain("Anhangabaú");
    });

    it("prefere o termo mais longo: casa em condomínio não vira casa", () => {
      const { profile } = extractor.extract(
        "procuro casa em condomínio fechado",
        undefined,
        JUNDIAI,
      );
      expect(profile.propertyType).toBe("Casa em Condomínio");
    });

    it("respeita fronteira de palavra: 'apenas' não vira apartamento", () => {
      const { profile } = extractor.extract("quero apenas informações", undefined, JUNDIAI);
      expect(profile.propertyType).toBeNull();
    });

    it("captura vários bairros citados na mesma frase", () => {
      const { profile } = extractor.extract(
        "pode ser no Centro ou no Eloy Chaves",
        undefined,
        JUNDIAI,
      );
      expect(profile.neighborhoods).toContain("Centro");
      expect(profile.neighborhoods).toContain("Eloy Chaves");
    });
  });

  // --------------------------------------------------------------------------
  describe("Tenant sobrescreve o vocabulário padrão do mercado", () => {
    it("usa a nomenclatura própria da imobiliária", () => {
      const custom = vocabularyFor("Curitiba", [["Batel"]], {
        propertyTypes: [
          ...DEFAULT_PROPERTY_TYPES.filter((t) => t.canonical !== "Kitnet/Studio"),
          { canonical: "Studio Compacto", aliases: ["kitnet", "studio", "compacto"] },
        ],
      });

      const { profile } = extractor.extract("procuro um studio no Batel", undefined, custom);
      expect(profile.propertyType).toBe("Studio Compacto");
      expect(profile.neighborhoods).toContain("Batel");
    });

    it("aceita garantia locatícia específica do tenant", () => {
      const custom = vocabularyFor("Porto Alegre", [["Moinhos de Vento"]], {
        rentalGuarantees: [
          ...DEFAULT_RENTAL_GUARANTEES,
          { canonical: "Garantia Parceira XPTO", aliases: ["xpto", "garantia xpto"] },
        ],
      });

      const { profile } = extractor.extract("posso usar a garantia XPTO?", undefined, custom);
      expect(profile.rentalGuarantee).toBe("Garantia Parceira XPTO");
    });
  });

  // --------------------------------------------------------------------------
  describe("Acúmulo de perfil entre mensagens", () => {
    it("preserva o que já foi extraído antes", () => {
      const primeira = extractor.extract("quero alugar no Eloy Chaves", undefined, JUNDIAI).profile;
      const segunda = extractor.extract("2 quartos, até 3 mil", primeira, JUNDIAI).profile;

      expect(segunda.neighborhoods).toContain("Eloy Chaves");
      expect(segunda.transactionType).toBe("RENT");
      expect(segunda.bedrooms).toBe(2);
      expect(segunda.maxBudget).toBe(3000);
    });
  });
});
