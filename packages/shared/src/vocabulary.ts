/**
 * Vocabulário de negócio e geografia usados na extração estruturada.
 *
 * DISTINÇÃO QUE ESTE ARQUIVO SUSTENTA (CLAUDE.md §10):
 *
 *   - GEOGRAFIA (cidades, bairros) é do TENANT. Não existe padrão em código:
 *     bairro de Jundiaí não pode ser reconhecido dentro do tenant de Recife.
 *
 *   - VOCABULÁRIO DE IMÓVEL (Apartamento, Kitnet, Caução, Fiador) é do MERCADO
 *     BRASILEIRO, não do primeiro cliente. Ter um catálogo padrão aqui é
 *     legítimo — é da mesma natureza dos estágios do funil. O tenant pode
 *     acrescentar ou renomear pelo `tenant_vocabulary`.
 */

export interface VocabularyTerm {
  /** Valor gravado no banco e mostrado ao corretor. */
  canonical: string;
  /**
   * Formas como o lead escreve, em minúsculas e sem acento.
   *
   * O próprio `canonical` é sempre considerado; não é preciso repeti-lo aqui.
   */
  aliases: string[];
}

export interface LocationTerm {
  canonical: string;
  normalized: string;
  aliases: string[];
  /** Só para bairros: cidade normalizada à qual pertence. */
  parentCityNormalized?: string | null;
}

export interface TenantVocabulary {
  cities: LocationTerm[];
  neighborhoods: LocationTerm[];
  propertyTypes: VocabularyTerm[];
  rentalGuarantees: VocabularyTerm[];
}

/** Vocabulário vazio: nenhuma geografia reconhecida, padrões de mercado mantidos. */
export const EMPTY_TENANT_VOCABULARY: TenantVocabulary = {
  cities: [],
  neighborhoods: [],
  propertyTypes: [],
  rentalGuarantees: [],
};

/**
 * Forma comparável de um termo: minúsculo, sem acento, espaços colapsados.
 *
 * Precisa ser a MESMA função no banco de dados e na extração — normalização
 * divergente faz o termo cadastrado nunca casar com o que o lead escreveu.
 */
export function normalizeTerm(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Catálogo padrão de tipos de imóvel no mercado brasileiro.
 *
 * Regra para aliases: só entram termos que, sozinhos, identificam o tipo. Um
 * alias curto e polissêmico contamina toda conversa — "area" fazia
 * "área de serviço" e "área de lazer" virarem `Terreno`.
 */
export const DEFAULT_PROPERTY_TYPES: VocabularyTerm[] = [
  {
    canonical: "Casa em Condomínio",
    aliases: [
      "casa em condominio",
      "casa de condominio",
      "condominio fechado",
      "casa em condominio fechado",
    ],
  },
  { canonical: "Apartamento", aliases: ["apartamento", "apto", "ape", "ap"] },
  { canonical: "Casa", aliases: ["casa", "sobrado", "casa terrea", "residencia"] },
  { canonical: "Cobertura", aliases: ["cobertura", "duplex", "triplex"] },
  {
    canonical: "Kitnet/Studio",
    aliases: ["kitnet", "kitinete", "quitinete", "studio", "loft", "flat"],
  },
  { canonical: "Terreno", aliases: ["terreno", "lote", "area de terreno"] },
  { canonical: "Chácara/Sítio", aliases: ["chacara", "sitio", "fazenda"] },
  {
    canonical: "Comercial",
    aliases: [
      "sala comercial",
      "ponto comercial",
      "galpao",
      "loja",
      "escritorio",
      "conjunto comercial",
    ],
  },
];

/** Garantias locatícias praticadas no Brasil. */
export const DEFAULT_RENTAL_GUARANTEES: VocabularyTerm[] = [
  {
    canonical: "Seguro Fiança",
    aliases: ["seguro fianca", "seguro-fianca", "porto seguro", "tokio marine"],
  },
  {
    canonical: "Caução",
    aliases: [
      "caucao",
      "deposito caucao",
      "deposito de caucao",
      "tres meses de deposito",
      "3 meses de deposito",
    ],
  },
  { canonical: "Fiador", aliases: ["fiador", "fiadora", "avalista"] },
  { canonical: "Título de Capitalização", aliases: ["titulo de capitalizacao", "capitalizacao"] },
  {
    canonical: "Garantia por Cartão",
    aliases: ["credpago", "cartao de credito", "garantia no cartao"],
  },
];

/**
 * Combina o catálogo padrão do mercado com o que o tenant cadastrou.
 *
 * Mesmo `canonical` UNE os aliases em vez de substituir. Substituir fazia o
 * tenant que recadastrasse "Kitnet/Studio" sem aliases perder o
 * reconhecimento de "kitnet" — uma perda silenciosa que ninguém pediu. Para
 * renomear de fato, o tenant usa um `canonical` diferente.
 */
export function mergeVocabularyTerms(
  defaults: VocabularyTerm[],
  tenantTerms: VocabularyTerm[],
): VocabularyTerm[] {
  const byCanonical = new Map<string, VocabularyTerm>();

  for (const term of defaults) {
    byCanonical.set(normalizeTerm(term.canonical), term);
  }

  for (const term of tenantTerms) {
    const key = normalizeTerm(term.canonical);
    const existing = byCanonical.get(key);

    byCanonical.set(key, {
      canonical: term.canonical,
      aliases: existing
        ? [...new Set([...existing.aliases, ...term.aliases].map(normalizeTerm))]
        : term.aliases,
    });
  }

  return [...byCanonical.values()];
}

/** Formas pelas quais um termo pode ser escrito, incluindo o próprio canônico. */
function candidatesOf(term: VocabularyTerm): string[] {
  return [normalizeTerm(term.canonical), ...term.aliases.map(normalizeTerm)];
}

/**
 * Encontra o termo cujo alias aparece no texto, preferindo o alias MAIS LONGO.
 *
 * O comprimento importa: "casa em condomínio" precisa ganhar de "casa", senão
 * toda casa de condomínio vira casa comum.
 */
export function matchVocabularyTerm(
  normalizedText: string,
  terms: VocabularyTerm[],
): VocabularyTerm | null {
  let best: VocabularyTerm | null = null;
  let bestLength = 0;

  for (const term of terms) {
    for (const alias of candidatesOf(term)) {
      if (alias.length <= bestLength) continue;
      if (containsWord(normalizedText, alias)) {
        best = term;
        bestLength = alias.length;
      }
    }
  }

  return best;
}

/** Idem, para geografia. Devolve todos os bairros citados, não apenas um. */
export function matchLocationTerms(
  normalizedText: string,
  locations: LocationTerm[],
): LocationTerm[] {
  return locations.filter(
    (loc) =>
      containsWord(normalizedText, loc.normalized) ||
      loc.aliases.some((alias) => containsWord(normalizedText, normalizeTerm(alias))),
  );
}

/**
 * Dois nomes de tipo de imóvel designam a mesma coisa?
 *
 * Comparação por conjunto de palavras, não por substring. "Kitnet/Studio" e
 * "Studio" casam; "Casa" e "Casa em Condomínio" casam; "Apartamento" e "Casa"
 * não. É o que permite conviver com catálogo importado de CRM alheio, que
 * escreve o tipo com a nomenclatura dele.
 */
export function propertyTypesMatch(a: string, b: string): boolean {
  const na = normalizeTerm(a);
  const nb = normalizeTerm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const tokensA = tokenize(na);
  const tokensB = tokenize(nb);
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  const [menor, maior] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  for (const token of menor) {
    if (!maior.has(token)) return false;
  }
  return true;
}

function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * Casamento por palavra inteira sobre texto já normalizado.
 *
 * Sem a fronteira de palavra, "ap" casaria dentro de "apenas" e todo lead que
 * escrevesse "apenas" viraria interessado em apartamento.
 */
function containsWord(normalizedText: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(normalizedText);
}
