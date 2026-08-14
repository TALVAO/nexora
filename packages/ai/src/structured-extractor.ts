import type { ExtractedLeadProfile, ExtractionResult } from "./types.js";

export class StructuredExtractor {
  extract(text: string, currentProfile?: ExtractedLeadProfile): ExtractionResult {
    const raw = text.toLowerCase();
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

    // 2. Property Type
    if (/\b(apartamento|apto|ap)\b/i.test(raw)) {
      profile.propertyType = "Apartamento";
    } else if (/\b(casa em condomínio|casa de condomínio|condomínio fechado)\b/i.test(raw)) {
      profile.propertyType = "Casa em Condomínio";
    } else if (/\b(casa|sobrado)\b/i.test(raw)) {
      profile.propertyType = "Casa";
    } else if (/\b(cobertura)\b/i.test(raw)) {
      profile.propertyType = "Cobertura";
    } else if (/\b(kitnet|kit|studio|loft)\b/i.test(raw)) {
      profile.propertyType = "Kitnet/Studio";
    } else if (/\b(sala comercial|galpão|ponto comercial)\b/i.test(raw)) {
      profile.propertyType = "Comercial";
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

    // 6. Neighborhoods (Bairros)
    const knownNeighborhoods = [
      "Eloy Chaves",
      "Retiro",
      "Centro",
      "Vila Arens",
      "Jardim do Trevo",
      "Medeiros",
      "Anhangabaú",
      "Caxambu",
      "Malota",
      "Jardim Botânico",
      "Engordadouro",
      "Vila Mariana",
      "Moema",
      "Pinheiros",
      "Perdizes",
      "Tatuapé",
    ];

    for (const nb of knownNeighborhoods) {
      if (new RegExp(`\\b${nb}\\b`, "i").test(text)) {
        if (!profile.neighborhoods) profile.neighborhoods = [];
        if (!profile.neighborhoods.includes(nb)) {
          profile.neighborhoods.push(nb);
        }
      }
    }

    // 7. City
    const knownCities = [
      "Jundiaí",
      "Jundiai",
      "São Paulo",
      "Sao Paulo",
      "Campinas",
      "Itupeva",
      "Louveira",
      "Cabreúva",
    ];
    for (const city of knownCities) {
      if (new RegExp(`\\b${city}\\b`, "i").test(text)) {
        profile.city = city.replace("Jundiai", "Jundiaí").replace("Sao Paulo", "São Paulo");
        break;
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

    // 10. Rental Guarantee
    if (/\b(caução|depósito caução|3 meses de depósito)\b/i.test(raw)) {
      profile.rentalGuarantee = "Caução";
    } else if (/\b(seguro fiança|porto seguro|tokio marine)\b/i.test(raw)) {
      profile.rentalGuarantee = "Seguro Fiança";
    } else if (/\b(fiador)\b/i.test(raw)) {
      profile.rentalGuarantee = "Fiador";
    } else if (/\b(credpago|cartão de crédito)\b/i.test(raw)) {
      profile.rentalGuarantee = "CredPago / Cartão";
    }

    return {
      profile,
      confidence: 0.9,
    };
  }
}
