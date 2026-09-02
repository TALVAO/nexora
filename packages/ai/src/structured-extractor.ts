import type { ExtractedLeadProfile, ExtractionResult } from "./types.js";
import {
  normalizeTerm,
  matchVocabularyTerm,
  matchLocationTerms,
  DEFAULT_PROPERTY_TYPES,
  DEFAULT_RENTAL_GUARANTEES,
  type TenantVocabulary,
} from "@nexora/shared";

/**
 * Vocabulário usado quando o chamador não informa nenhum.
 *
 * Contém APENAS o catálogo padrão do mercado brasileiro. A geografia fica
 * vazia de propósito: reconhecer bairro sem saber de qual tenant é significaria
 * vazar o contexto de um cliente dentro de outro (CLAUDE.md §10).
 */
const FALLBACK_VOCABULARY: TenantVocabulary = {
  cities: [],
  neighborhoods: [],
  propertyTypes: DEFAULT_PROPERTY_TYPES,
  rentalGuarantees: DEFAULT_RENTAL_GUARANTEES,
};

export class StructuredExtractor {
  extract(
    text: string,
    currentProfile?: ExtractedLeadProfile,
    vocabulary?: TenantVocabulary,
  ): ExtractionResult {
    const raw = text.toLowerCase();
    const normalized = normalizeTerm(text);
    const vocab = vocabulary ?? FALLBACK_VOCABULARY;

    const profile: ExtractedLeadProfile = {
      transactionType: currentProfile?.transactionType ?? null,
      propertyType: currentProfile?.propertyType ?? null,
      city: currentProfile?.city ?? null,
      neighborhoods: currentProfile?.neighborhoods ? [...currentProfile.neighborhoods] : [],
      maxBudget: currentProfile?.maxBudget ?? null,
      bedrooms: currentProfile?.bedrooms ?? null,
      parkingSpaces: currentProfile?.parkingSpaces ?? null,
      hasPet: currentProfile?.hasPet ?? null,
      moveDate: currentProfile?.moveDate ?? null,
      rentalGuarantee: currentProfile?.rentalGuarantee ?? null,
      notes: currentProfile?.notes ?? null,
    };

    // 1. Transaction Type (RENT vs BUY and switches)
    if (
      /\b(prefiro comprar|em vez de alugar|ao invés de alugar|mudei de ideia.*comprar|agora quero comprar)\b/i.test(
        raw,
      )
    ) {
      profile.transactionType = "BUY";
    } else if (
      /\b(prefiro alugar|em vez de comprar|ao invés de comprar|mudei de ideia.*alugar|agora vou alugar)\b/i.test(
        raw,
      )
    ) {
      profile.transactionType = "RENT";
    } else {
      if (
        /\b(comprar|compra|venda|adquirir)\b/i.test(raw) &&
        !/\b(alugar|locação|locacao|aluguel)\b/i.test(raw)
      ) {
        profile.transactionType = "BUY";
      } else if (
        /\b(alugar|locação|locacao|aluguel)\b/i.test(raw) &&
        !/\b(comprar|compra|venda|adquirir)\b/i.test(raw)
      ) {
        profile.transactionType = "RENT";
      }
    }

    // 2. Property Type — vocabulário do tenant sobre o padrão do mercado
    const propertyTypeMatch = matchVocabularyTerm(normalized, vocab.propertyTypes);
    if (propertyTypeMatch) {
      profile.propertyType = propertyTypeMatch.canonical;
    }

    // 3. Bedrooms (Dormitórios)
    const bedroomsMatch =
      raw.match(/(\d+)\s*(?:quarto|quartos|dorm|dorms|dormitório|dormitórios|dts)/i) ||
      raw.match(
        /(um|dois|três|tres|quatro)\s*(?:quarto|quartos|dorm|dorms|dormitório|dormitórios)/i,
      );

    if (bedroomsMatch) {
      const val = bedroomsMatch[1]?.toLowerCase();
      if (val === "um") profile.bedrooms = 1;
      else if (val === "dois") profile.bedrooms = 2;
      else if (val === "três" || val === "tres") profile.bedrooms = 3;
      else if (val === "quatro") profile.bedrooms = 4;
      else if (val && !isNaN(Number(val))) profile.bedrooms = Number(val);
    }

    // 4. Parking Spaces (Vagas)
    const parkingMatch =
      raw.match(/(\d+)\s*(?:vaga|vagas|garagem|garagens)/i) ||
      raw.match(/(uma|duas|três|tres)\s*(?:vaga|vagas|garagem)/i);

    if (parkingMatch) {
      const val = parkingMatch[1]?.toLowerCase();
      if (val === "uma") profile.parkingSpaces = 1;
      else if (val === "duas") profile.parkingSpaces = 2;
      else if (val === "três" || val === "tres") profile.parkingSpaces = 3;
      else if (val && !isNaN(Number(val))) profile.parkingSpaces = Number(val);
    } else if (/\b(com garagem|com vaga)\b/i.test(raw)) {
      profile.parkingSpaces = profile.parkingSpaces ?? 1;
    }

    // 5. Max Budget (Orçamento)
    if (/(\d+)\s*mil\s*e\s*quinhentos/i.test(raw)) {
      const match = raw.match(/(\d+)\s*mil\s*e\s*quinhentos/i);
      if (match) profile.maxBudget = Number(match[1]) * 1000 + 500;
    } else if (/(\d+)[.,](\d+)\s*milhões?/i.test(raw)) {
      const match = raw.match(/(\d+)[.,](\d+)\s*milhões?/i);
      if (match) profile.maxBudget = Number(`${match[1]}.${match[2]}`) * 1000000;
    } else if (/(\d+)\s*milhões?/i.test(raw)) {
      const match = raw.match(/(\d+)\s*milhões?/i);
      if (match) profile.maxBudget = Number(match[1]) * 1000000;
    } else if (/(\d+)\s*mil\b/i.test(raw)) {
      const match = raw.match(/(\d+)\s*mil\b/i);
      if (match) profile.maxBudget = Number(match[1]) * 1000;
    } else if (/(\d+)[.,](\d+)\s*k\b/i.test(raw)) {
      const match = raw.match(/(\d+)[.,](\d+)\s*k\b/i);
      if (match) profile.maxBudget = Number(`${match[1]}.${match[2]}`) * 1000;
    } else if (/(\d+)\s*k\b/i.test(raw)) {
      const match = raw.match(/(\d+)\s*k\b/i);
      if (match) profile.maxBudget = Number(match[1]) * 1000;
    } else {
      const numericBudgetMatch = raw.match(
        /(?:até|limite|valor de|aluguel de|máximo de|orcamento|orçamento|por|r\$)\s*(\d{1,3}(?:\.\d{3})+|\d{3,7})(?:\s*reais)?/i,
      );
      if (numericBudgetMatch && numericBudgetMatch[1]) {
        const clean = numericBudgetMatch[1].replace(/\./g, "");
        const num = Number(clean);
        if (!isNaN(num) && num > 100) {
          profile.maxBudget = num;
        }
      }
    }

    // 6. Bairros — exclusivamente da geografia cadastrada do tenant
    const matchedNeighborhoods = matchLocationTerms(normalized, vocab.neighborhoods);
    for (const nb of matchedNeighborhoods) {
      if (!profile.neighborhoods) profile.neighborhoods = [];
      if (!profile.neighborhoods.includes(nb.canonical)) {
        profile.neighborhoods.push(nb.canonical);
      }
    }

    // 7. Cidade — citada diretamente ou inferida do bairro, nunca no chute
    //
    // Ambiguidade não vira palpite: "Centro" pode existir em duas cidades do
    // mesmo tenant. Inventar a cidade sujaria `lead_profiles` com um fato que
    // o lead nunca disse e que o matching usaria como verdade (§22).
    const matchedCities = matchLocationTerms(normalized, vocab.cities);
    const distinctCities = new Set(matchedCities.map((c) => c.normalized));

    if (matchedCities[0] && distinctCities.size === 1) {
      profile.city = matchedCities[0].canonical;
    } else if (matchedCities.length === 0 && matchedNeighborhoods.length > 0) {
      const parents = new Set(
        matchedNeighborhoods
          .map((nb) => nb.parentCityNormalized)
          .filter((parent): parent is string => Boolean(parent)),
      );

      if (parents.size === 1) {
        const [parent] = [...parents];
        const parentCity = vocab.cities.find((c) => c.normalized === parent);
        if (parentCity) profile.city = parentCity.canonical;
      }
    }

    // 8. Pet Friendly
    if (
      /\b(aceita pet|aceita cachorro|aceita gato|tenho pet|tenho cachorro|tenho gato|com pet|com animal)\b/i.test(
        raw,
      )
    ) {
      profile.hasPet = true;
    } else if (/\b(não tenho pet|sem pet|sem animal|não tenho animal)\b/i.test(raw)) {
      profile.hasPet = false;
    }

    // 9. Move Date
    if (/\b(urgente|o quanto antes|imediatamente|pra já|pra ontem)\b/i.test(raw)) {
      profile.moveDate = "Imediato / Urgente";
    } else if (/\b(este mês|esse mês|neste mês)\b/i.test(raw)) {
      profile.moveDate = "Este mês";
    } else if (/\b(mês que vem|mes que vem|próximo mês)\b/i.test(raw)) {
      profile.moveDate = "Próximo mês";
    } else if (/\b(em 30 dias|em 60 dias|em 90 dias)\b/i.test(raw)) {
      const match = raw.match(/em \d+ dias/i);
      if (match) profile.moveDate = match[0];
    }

    // 10. Garantia locatícia — vocabulário do tenant sobre o padrão do mercado
    const guaranteeMatch = matchVocabularyTerm(normalized, vocab.rentalGuarantees);
    if (guaranteeMatch) {
      profile.rentalGuarantee = guaranteeMatch.canonical;
    }

    return {
      profile,
      confidence: 0.9,
    };
  }
}
