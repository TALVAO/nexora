import { XMLParser } from "fast-xml-parser";
import type { CreatePropertyInput } from "@nexora/database";

/**
 * Importador do formato VRSync (Etapa 15.2).
 *
 * VRSync é o padrão XML que o Grupo OLX (ZAP Imóveis / VivaReal) exige de toda
 * imobiliária desde a descontinuação do formato antigo em outubro de 2024 —
 * ou seja, praticamente toda imobiliária brasileira já GERA esse arquivo para
 * alimentar os portais. Aceitar VRSync significa "importo seu catálogo em 5
 * minutos" em qualquer reunião de venda, sem esperar a Etapa 15.4 (descoberta
 * do CRM) para o corretor conseguir cadastrar imóveis em lote.
 *
 * Estrutura oficial (developers.grupozap.com/feeds/vrsync):
 *
 *   ListingDataFeed
 *     Header                       (metadados do publicador — não usados aqui)
 *     Listings
 *       Listing (0..n)
 *         ListingID                 string, único
 *         Title                     string
 *         TransactionType           "For Sale" | "For Rent" | "Sale/Rent"
 *         DetailViewUrl             url do anúncio no site de origem
 *         Media > Item[]            medium="image"|"video", primary="true"
 *         Details
 *           UsageType, PropertyType ex.: "Residential / Apartment"
 *           ListPrice / RentalPrice currency="BRL"
 *           PropertyAdministrationFee (condomínio)
 *           Bedrooms, Bathrooms, Garage, Suites
 *           Features > Feature[]
 *           Warranties > Warranty[] (garantias locatícias)
 *         Location
 *           City, Neighborhood, Address, StreetNumber
 *
 * Confirmado por documentação oficial em 01/09/2026, não deduzido.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Sem isso, um feed com um único <Listing> (ou um único <Feature>/<Item>)
  // vira objeto solto em vez de array de 1 — e todo o resto do parser abaixo
  // quebraria silenciosamente ao chamar `.map`/`.filter` num objeto.
  isArray: (_name, jpath) =>
    typeof jpath === "string" &&
    [
      "ListingDataFeed.Listings.Listing",
      "ListingDataFeed.Listings.Listing.Media.Item",
      "ListingDataFeed.Listings.Listing.Details.Features.Feature",
      "ListingDataFeed.Listings.Listing.Details.Warranties.Warranty",
    ].includes(jpath),
});

/** Um item de texto pode chegar como string simples ou `{ "#text": "..." }" quando tem atributos. */
function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    const text = (node as Record<string, unknown>)["#text"];
    return textOf(text);
  }
  return null;
}

function numberOf(node: unknown): number | null {
  const text = textOf(node);
  if (text === null) return null;
  const value = Number(text.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function intOf(node: unknown): number | null {
  const value = numberOf(node);
  return value === null ? null : Math.round(value);
}

/** "Residential / Apartment" -> "Apartment". Sem "/", devolve o texto inteiro. */
function extractPropertyType(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split("/");
  const last = parts[parts.length - 1]?.trim();
  return last || null;
}

export interface VrSyncImportResult {
  properties: CreatePropertyInput[];
  /**
   * Listings do feed que não puderam ser importados, com o motivo em pt-BR —
   * diferente do CsvPropertyImporter, que descarta linha incompleta em
   * silêncio. Aqui a origem é uma integração de terceiro que o corretor não
   * escreveu à mão; ele precisa saber que algo do feed foi ignorado, não só
   * ver uma contagem menor que o esperado sem explicação (CLAUDE.md §22).
   */
  skipped: Array<{ listingId: string | null; reason: string }>;
}

export class VrSyncPropertyImporter {
  /**
   * Converte um feed VRSync em imóveis prontos para `PropertyRepository.bulkCreate`.
   * @throws {Error} quando o XML não é bem formado ou não segue a estrutura
   *                  `ListingDataFeed > Listings > Listing` do padrão VRSync.
   */
  parseXml(xmlContent: string): VrSyncImportResult {
    let parsed: unknown;
    try {
      parsed = parser.parse(xmlContent, true);
    } catch (err) {
      throw new Error(
        `XML inválido: ${err instanceof Error ? err.message : "erro de sintaxe"}.`,
      );
    }

    const rootFeedRaw = (parsed as Record<string, unknown> | undefined)?.["ListingDataFeed"];
    if (typeof rootFeedRaw !== "object" || rootFeedRaw === null) {
      throw new Error(
        "XML não segue o formato VRSync esperado (elemento raiz ListingDataFeed não encontrado).",
      );
    }
    const rootFeed = rootFeedRaw as Record<string, unknown>;

    if (!("Listings" in rootFeed)) {
      throw new Error("XML não segue o formato VRSync esperado (elemento Listings não encontrado).");
    }

    // Feed com Listings vazio (`<Listings></Listings>` ou só espaço em branco)
    // é um catálogo vazio válido — um tenant novo ou um filtro upstream que
    // zerou o resultado —, não um erro de formato. Nesse caso o parser
    // devolve `Listings` como string vazia, não como objeto: sem `Listing`
    // algum registrado, `isArray` nunca chega a rodar para forçar o array.
    const listingsContainer = rootFeed["Listings"];
    const listings =
      typeof listingsContainer === "object" && listingsContainer !== null
        ? ((listingsContainer as Record<string, unknown>)["Listing"] ?? [])
        : [];
    if (!Array.isArray(listings)) {
      throw new Error(
        "XML não segue o formato VRSync esperado (Listings.Listing em formato inesperado).",
      );
    }

    const properties: CreatePropertyInput[] = [];
    const skipped: VrSyncImportResult["skipped"] = [];

    for (const listing of listings as Record<string, unknown>[]) {
      const listingId = textOf(listing["ListingID"]);
      const property = this.mapListing(listing, listingId);

      if (property.error) {
        skipped.push({ listingId, reason: property.error });
        continue;
      }

      properties.push(property.value!);
    }

    return { properties, skipped };
  }

  private mapListing(
    listing: Record<string, unknown>,
    listingId: string | null,
  ): { value?: CreatePropertyInput; error?: string } {
    const title = textOf(listing["Title"]);
    const details = (listing["Details"] as Record<string, unknown>) || {};
    const location = (listing["Location"] as Record<string, unknown>) || {};

    const city = textOf(location["City"]);

    const txRaw = (textOf(listing["TransactionType"]) || "").toLowerCase();
    let transactionType: CreatePropertyInput["transactionType"] | null = null;
    if (txRaw === "sale/rent") transactionType = "RENT_OR_BUY";
    else if (txRaw === "for sale") transactionType = "BUY";
    else if (txRaw === "for rent") transactionType = "RENT";

    if (!title || !city || !transactionType) {
      return {
        error: `Faltam campos obrigatórios (Title, Location/City ou TransactionType reconhecido: "${textOf(listing["TransactionType"]) || "ausente"}").`,
      };
    }

    // Locação é a prioridade operacional do MVP (CLAUDE.md §1). Um imóvel
    // "Sale/Rent" que só tem ListPrice cadastrado ainda assim entra no
    // catálogo — melhor com o preço de venda do que rejeitado.
    const rentalPrice = numberOf(details["RentalPrice"]);
    const listPrice = numberOf(details["ListPrice"]);
    const price = transactionType === "BUY" ? listPrice ?? rentalPrice : rentalPrice ?? listPrice;

    if (!price) {
      return { error: "Nenhum preço válido (ListPrice ou RentalPrice) encontrado." };
    }

    // `Details.Features.Feature[]` existe no feed (amenidades como "Piscina",
    // "Elevador") mas não tem onde entrar em `CreatePropertyInput` hoje — não
    // criamos um campo especulativo para guardá-lo (CLAUDE.md §2). Fica de
    // fora até haver um caso de uso real (ex.: matching por amenidade).
    const warrantiesNode = (details["Warranties"] as Record<string, unknown> | undefined)?.[
      "Warranty"
    ];

    const rentalGuarantees = Array.isArray(warrantiesNode)
      ? warrantiesNode.map((w) => textOf(w)).filter((w): w is string => Boolean(w))
      : [];

    const mediaItems = ((listing["Media"] as Record<string, unknown> | undefined)?.[
      "Item"
    ] || []) as Array<Record<string, unknown>>;
    const images = mediaItems.filter((item) => item["@_medium"] === "image");
    const primaryImage = images.find((item) => item["@_primary"] === "true") ?? images[0];

    return {
      value: {
        externalId: listingId,
        title,
        transactionType,
        // Preserva o vocabulário do próprio feed em vez de traduzir ou
        // restringir a uma lista fixa — mesma filosofia do CsvPropertyImporter
        // e do §10 do CLAUDE.md (vocabulário é dado do tenant, não constante
        // de código).
        propertyType: extractPropertyType(textOf(details["PropertyType"])),
        city,
        neighborhood: textOf(location["Neighborhood"]),
        price,
        condoFee: numberOf(details["PropertyAdministrationFee"]),
        bedrooms: intOf(details["Bedrooms"]),
        bathrooms: intOf(details["Bathrooms"]),
        parkingSpaces: intOf(details["Garage"]),
        // VRSync não tem um campo dedicado de "aceita pet" — só uma lista
        // livre de Features cujos textos variam entre publicadores. Inferir
        // a partir de texto livre arriscaria marcar "não aceita" como "aceita"
        // por semelhança de palavra. Sem fonte confiável, fica null (§22).
        petsAllowed: null,
        rentalGuarantees,
        // Importar É a afirmação de disponibilidade deste instante — mesma
        // regra do cadastro manual (Etapa 15.1). A origem XML_FEED entra no
        // carimbo que o PropertyRepository grava.
        availabilitySource: "XML_FEED",
        url: textOf(listing["DetailViewUrl"]),
        mainImageUrl: primaryImage ? textOf(primaryImage) : null,
      },
    };
  }
}
