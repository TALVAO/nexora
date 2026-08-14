import { describe, it, expect } from "vitest";
import { PropertyMatcher } from "../catalog/property-matcher.js";
import { CsvPropertyImporter } from "../catalog/csv-importer.js";
import type { PropertyRow, LeadProfileData } from "@nexora/database";

describe("Property Matching Engine & Deterministic Guardrails (Etapa 8)", () => {
  const matcher = new PropertyMatcher();
  const csvImporter = new CsvPropertyImporter();

  const mockLeadProfile: LeadProfileData = {
    transaction_type: "RENT",
    property_type: "Apartamento",
    city: "Jundiaí",
    neighborhoods: ["Eloy Chaves", "Medeiros"],
    max_budget: 3500,
    bedrooms: 2,
    parking_spaces: 1,
    pet_required: true,
    rental_guarantee: "Caução",
  };

  const sampleAvailableProperty: PropertyRow = {
    id: "prop-01",
    tenant_id: "tenant-1",
    external_id: "AP001",
    title: "Lindo Apto 2Q no Eloy Chaves",
    transaction_type: "RENT",
    property_type: "Apartamento",
    city: "Jundiaí",
    neighborhood: "Eloy Chaves",
    price: 3200,
    condo_fee: 450,
    bedrooms: 2,
    bathrooms: 2,
    parking_spaces: 1,
    pets_allowed: true,
    rental_guarantees_json: ["Caução", "Seguro Fiança"],
    status: "AVAILABLE",
    url: "https://imobiliaria.com/imovel/AP001",
    main_image_url: "https://imobiliaria.com/img/AP001.jpg",
    metadata_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("Deterministic Hard Filters (Definition of Done)", () => {
    // --------------------------------------------------------------------------
    // TESTE CRÍTICO OBRIGATÓRIO (DoD):
    // "Um imóvel incompatível por preço/status não é recomendado mesmo que semanticamente 'pareça bom'."
    // --------------------------------------------------------------------------
    it("CRITICAL DoD: should NEVER recommend an unavailable property (RENTED / SOLD / RESERVED)", () => {
      const rentedProperty: PropertyRow = {
        ...sampleAvailableProperty,
        status: "RENTED",
      };

      const result = matcher.evaluateMatch(mockLeadProfile, rentedProperty);

      expect(result.isEligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toContain("indisponível");
    });

    it("CRITICAL DoD: should NEVER recommend a property with price exceeding max budget by > 10%", () => {
      const expensiveProperty: PropertyRow = {
        ...sampleAvailableProperty,
        price: 4200, // Orçamento é 3500 -> limite com 10% é 3850 -> 4200 deve ser rejeitado
      };

      const result = matcher.evaluateMatch(mockLeadProfile, expensiveProperty);

      expect(result.isEligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toContain("Preço acima do orçamento máximo");
    });

    it("CRITICAL DoD: should NEVER recommend a BUY property to a RENT lead", () => {
      const saleProperty: PropertyRow = {
        ...sampleAvailableProperty,
        transaction_type: "BUY",
        price: 450000,
      };

      const result = matcher.evaluateMatch(mockLeadProfile, saleProperty);

      expect(result.isEligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toContain("Tipo de transação incompatível");
    });

    it("CRITICAL DoD: should NEVER recommend a property that forbids pets when lead requires pets", () => {
      const noPetsProperty: PropertyRow = {
        ...sampleAvailableProperty,
        pets_allowed: false,
      };

      const result = matcher.evaluateMatch(mockLeadProfile, noPetsProperty);

      expect(result.isEligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toContain("não aceita animais");
    });
  });

  describe("Compatibility Scoring & Ranking", () => {
    it("should score high (>= 90 pts) for a perfect match in neighborhood and budget", () => {
      const result = matcher.evaluateMatch(mockLeadProfile, sampleAvailableProperty);

      expect(result.isEligible).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    });

    it("should rank properties accurately in findMatchesForProfile", () => {
      const perfectMatch = sampleAvailableProperty;
      const partialMatch: PropertyRow = {
        ...sampleAvailableProperty,
        id: "prop-02",
        neighborhood: "Vila Arens", // Bairro não solicitado pelo lead
        price: 3400,
      };

      const matches = matcher.findMatchesForProfile(mockLeadProfile, [partialMatch, perfectMatch]);

      expect(matches.length).toBe(2);
      expect(matches[0]!.property.id).toBe("prop-01"); // Perfect match deve vir primeiro
      expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
    });
  });

  describe("CsvPropertyImporter", () => {
    it("should parse CSV content into valid CreatePropertyInput array", () => {
      const csvData = `
external_id,title,transaction_type,property_type,city,neighborhood,price,condo_fee,bedrooms,bathrooms,parking_spaces,pets_allowed,url,main_image_url
AP101,"Apto 3Q Reserva da Serra",RENT,Apartamento,Jundiaí,Medeiros,3800,600,3,2,2,true,https://site.com/101,https://site.com/101.jpg
CS202,"Casa 4Q Malota",BUY,Casa,Jundiaí,Malota,1500000,0,4,4,3,true,https://site.com/202,https://site.com/202.jpg
      `.trim();

      const parsed = csvImporter.parseCsv(csvData);

      expect(parsed.length).toBe(2);
      expect(parsed[0]!.externalId).toBe("AP101");
      expect(parsed[0]!.transactionType).toBe("RENT");
      expect(parsed[0]!.price).toBe(3800);
      expect(parsed[0]!.bedrooms).toBe(3);
      expect(parsed[0]!.petsAllowed).toBe(true);

      expect(parsed[1]!.externalId).toBe("CS202");
      expect(parsed[1]!.transactionType).toBe("BUY");
      expect(parsed[1]!.price).toBe(1500000);
    });
  });
});
