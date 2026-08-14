import type { PropertyRow, LeadProfileData } from "@nexora/database";

export interface MatchEvaluationResult {
  property: PropertyRow;
  score: number;
  isEligible: boolean;
  reasons: string[];
  rejectionReason?: string;
}

export class PropertyMatcher {
  /**
   * Avalia a compatibilidade determinística entre o perfil qualificado do lead e um imóvel.
   * Regra inviolável: Imóvel incompatível por preço, tipo de transação ou status nunca é recomendado.
   */
  evaluateMatch(profile: LeadProfileData, property: PropertyRow): MatchEvaluationResult {
    const reasons: string[] = [];

    // --------------------------------------------------------------------------
    // HARD FILTERS (Filtros Eliminatórios Rígidos)
    // --------------------------------------------------------------------------

    // 1. Status: Apenas imóveis AVAILABLE são elegíveis
    if (property.status !== "AVAILABLE") {
      return {
        property,
        score: 0,
        isEligible: false,
        reasons: [],
        rejectionReason: `Imóvel indisponível (Status: ${property.status}).`,
      };
    }

    // 2. Tipo de Transação: Compatibilidade estrita entre Locação e Venda
    if (profile.transaction_type && property.transaction_type !== "RENT_OR_BUY") {
      const leadTx = profile.transaction_type.toUpperCase();
      const propTx = property.transaction_type.toUpperCase();

      if (leadTx === "RENT" && propTx !== "RENT") {
        return {
          property,
          score: 0,
          isEligible: false,
          reasons: [],
          rejectionReason: `Tipo de transação incompatível (Lead busca locação, imóvel é venda).`,
        };
      }

      if (leadTx === "BUY" && propTx !== "BUY") {
        return {
          property,
          score: 0,
          isEligible: false,
          reasons: [],
          rejectionReason: `Tipo de transação incompatível (Lead busca compra, imóvel é locação).`,
        };
      }
    }

    // 3. Orçamento Máximo com tolerância de até 10%
    if (profile.max_budget && profile.max_budget > 0) {
      const maxAllowed = profile.max_budget * 1.1; // Máximo 10% de margem
      const priceNum = Number(property.price);

      if (priceNum > maxAllowed) {
        return {
          property,
          score: 0,
          isEligible: false,
          reasons: [],
          rejectionReason: `Preço acima do orçamento máximo com margem (R$ ${priceNum} > R$ ${maxAllowed.toFixed(0)}).`,
        };
      }
    }

    // 4. Pet Obrigatório
    if (profile.pet_required === true && property.pets_allowed === false) {
      return {
        property,
        score: 0,
        isEligible: false,
        reasons: [],
        rejectionReason: `Imóvel não aceita animais de estimação (Pet é obrigatório para o lead).`,
      };
    }

    // --------------------------------------------------------------------------
    // SCORING (Pontuação de 0 a 100)
    // --------------------------------------------------------------------------
    let score = 0;

    // Bairro desejado (+35 pontos)
    if (profile.neighborhoods && profile.neighborhoods.length > 0 && property.neighborhood) {
      const propNeighborhood = property.neighborhood.toLowerCase();
      const matchedNeighborhood = profile.neighborhoods.find((n) =>
        propNeighborhood.includes(n.toLowerCase()),
      );

      if (matchedNeighborhood) {
        score += 35;
        reasons.push(`Localizado no bairro desejado: ${property.neighborhood}`);
      }
    }

    // Preço dentro do teto (+25 pontos)
    if (profile.max_budget && profile.max_budget > 0) {
      const priceNum = Number(property.price);
      if (priceNum <= profile.max_budget) {
        score += 25;
        reasons.push(`Valor dentro do orçamento máximo (R$ ${priceNum.toLocaleString("pt-BR")})`);
      } else {
        score += 15;
        reasons.push(
          `Valor com margem de negociação aceitável (R$ ${priceNum.toLocaleString("pt-BR")})`,
        );
      }
    } else {
      score += 20;
    }

    // Quantidade de Quartos (+20 pontos)
    if (profile.bedrooms && profile.bedrooms > 0) {
      if (property.bedrooms && property.bedrooms >= profile.bedrooms) {
        score += 20;
        reasons.push(`Atende ao número de dormitórios solicitado (${property.bedrooms} quartos)`);
      }
    } else {
      score += 10;
    }

    // Vagas de Garagem (+10 pontos)
    if (profile.parking_spaces && profile.parking_spaces > 0) {
      if (property.parking_spaces && property.parking_spaces >= profile.parking_spaces) {
        score += 10;
        reasons.push(`Possui as vagas de garagem requeridas (${property.parking_spaces} vagas)`);
      }
    } else {
      score += 5;
    }

    // Tipo de Imóvel (+10 pontos)
    if (profile.property_type && property.property_type) {
      if (
        property.property_type.toLowerCase().includes(profile.property_type.toLowerCase()) ||
        profile.property_type.toLowerCase().includes(property.property_type.toLowerCase())
      ) {
        score += 10;
        reasons.push(`Tipo de imóvel compatível: ${property.property_type}`);
      }
    }

    return {
      property,
      score: Math.min(score, 100),
      isEligible: score >= 40,
      reasons,
    };
  }

  /**
   * Filtra e classifica um conjunto de propriedades para um lead.
   */
  findMatchesForProfile(
    profile: LeadProfileData,
    properties: PropertyRow[],
    minScore = 50,
  ): MatchEvaluationResult[] {
    return properties
      .map((p) => this.evaluateMatch(profile, p))
      .filter((res) => res.isEligible && res.score >= minScore)
      .sort((a, b) => b.score - a.score);
  }
}
