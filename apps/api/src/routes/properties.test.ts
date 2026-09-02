import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo } from "../test-utils/auth.js";
import {
  PropertyRepository,
  LeadRepository,
  TenantRepository,
  type PropertyRow,
  type TenantRow,
  type Lead360View,
} from "@nexora/database";
import { PropertyMatcher, CsvPropertyImporter } from "@nexora/messaging";

describe("Properties & Matchmaking API Routes Integration (Etapa 8)", () => {
  let app: FastifyInstance;
  let propertyRepo: PropertyRepository;
  let leadRepo: LeadRepository;
  let tenantRepo: TenantRepository;
  let matcher: PropertyMatcher;
  let csvImporter: CsvPropertyImporter;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testPropertyId = "prop-api-001";
  const testLeadId = "lead-api-001";

  const fakeProperty: PropertyRow = {
    id: testPropertyId,
    tenant_id: testTenantId,
    external_id: "AP001",
    title: "Apartamento 2Q no Eloy Chaves",
    transaction_type: "RENT",
    property_type: "Apartamento",
    city: "Jundiaí",
    neighborhood: "Eloy Chaves",
    price: 3200,
    condo_fee: 400,
    bedrooms: 2,
    bathrooms: 2,
    parking_spaces: 1,
    pets_allowed: true,
    rental_guarantees_json: ["Caução"],
    status: "AVAILABLE",
    // Procedência da disponibilidade (Etapa 15.1). Verificado há 2h: dentro da
    // janela padrão de 24h, portanto afirmável.
    availability_source: "AGENT_CONFIRMED",
    availability_verified_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    url: "https://site.com/AP001",
    main_image_url: "https://site.com/AP001.jpg",
    metadata_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  /** Tenant com a janela padrão da migration 05 (24h fresco / 7 dias vencido). */
  const fakeTenant: TenantRow = {
    id: testTenantId,
    name: "Imobiliária Teste",
    slug: "imobiliaria-teste",
    status: "ACTIVE",
    timezone: "America/Sao_Paulo",
    availability_fresh_hours: 24,
    availability_stale_hours: 168,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    propertyRepo = new PropertyRepository();
    leadRepo = new LeadRepository();
    matcher = new PropertyMatcher();
    csvImporter = new CsvPropertyImporter();

    tenantRepo = createAuthTestTenantRepo();

    app = await buildApp({
      tenantRepo,
      propertyRepo,
      leadRepo,
      matcher,
      csvImporter,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/properties", () => {
    it("should list properties with filters", async () => {
      propertyRepo.list = async () => [fakeProperty];

      const response = await app.inject({
        method: "GET",
        url: "/api/properties?city=Jundiaí&status=AVAILABLE",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.properties.length).toBe(1);
      expect(body.properties[0].id).toBe(testPropertyId);
    });
  });

  describe("GET /api/properties/:id", () => {
    it("should return property details", async () => {
      propertyRepo.findById = async () => fakeProperty;

      const response = await app.inject({
        method: "GET",
        url: `/api/properties/${testPropertyId}`,
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.property.id).toBe(testPropertyId);
    });

    it("should return 404 if property not found", async () => {
      propertyRepo.findById = async () => null;

      const response = await app.inject({
        method: "GET",
        url: `/api/properties/non-existent`,
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/properties", () => {
    it("should create a property", async () => {
      propertyRepo.create = async () => fakeProperty;

      const response = await app.inject({
        method: "POST",
        url: "/api/properties",
        headers: authHeaders(app),
        payload: {
          title: "Apartamento 2Q no Eloy Chaves",
          transactionType: "RENT",
          city: "Jundiaí",
          price: 3200,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.property.id).toBe(testPropertyId);
    });
  });

  describe("POST /api/properties/import-csv", () => {
    it("should bulk import properties from CSV content", async () => {
      propertyRepo.bulkCreate = async () => ({ inserted: 2 });

      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-csv",
        headers: authHeaders(app),
        payload: {
          csvContent: `external_id,title,transaction_type,city,price\n1,Apto 1,RENT,Jundiaí,2500\n2,Casa 2,BUY,Jundiaí,900000`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.importedCount).toBe(2);
    });
  });

  describe("POST /api/properties/import-vrsync (Etapa 15.2)", () => {
    const feedValido = `<ListingDataFeed><Listings><Listing>
      <ListingID>V1</ListingID>
      <Title>Apartamento para alugar</Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">2200</RentalPrice></Details>
      <Location><City>Jundiaí</City></Location>
    </Listing></Listings></ListingDataFeed>`;

    it("importa um feed VRSync válido e devolve contagem de sucesso e de ignorados", async () => {
      propertyRepo.bulkCreate = async () => ({ inserted: 1 });

      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-vrsync",
        headers: authHeaders(app),
        payload: { xmlContent: feedValido },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.importedCount).toBe(1);
      expect(body.skippedCount).toBe(0);
    });

    it("reporta listings ignorados do feed sem derrubar a importação", async () => {
      propertyRepo.bulkCreate = async () => ({ inserted: 1 });

      const feedMisto = `<ListingDataFeed><Listings>
        <Listing>
          <ListingID>Ruim-1</ListingID>
          <Title>Sem transação reconhecida</Title>
          <TransactionType>Permuta</TransactionType>
          <Details><ListPrice currency="BRL">100000</ListPrice></Details>
          <Location><City>Jundiaí</City></Location>
        </Listing>
        <Listing>
          <ListingID>Bom-1</ListingID>
          <Title>Válido</Title>
          <TransactionType>For Rent</TransactionType>
          <Details><RentalPrice currency="BRL">1800</RentalPrice></Details>
          <Location><City>Jundiaí</City></Location>
        </Listing>
      </Listings></ListingDataFeed>`;

      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-vrsync",
        headers: authHeaders(app),
        payload: { xmlContent: feedMisto },
      });

      const body = JSON.parse(response.payload);
      expect(body.importedCount).toBe(1);
      expect(body.skippedCount).toBe(1);
      expect(body.skipped[0].listingId).toBe("Ruim-1");
    });

    it("devolve 400 (não 500) para XML malformado, sem chamar o banco", async () => {
      let bulkCreateCalled = false;
      propertyRepo.bulkCreate = async () => {
        bulkCreateCalled = true;
        return { inserted: 0 };
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-vrsync",
        headers: authHeaders(app),
        payload: { xmlContent: "<ListingDataFeed><Listings>" },
      });

      expect(response.statusCode).toBe(400);
      expect(bulkCreateCalled).toBe(false);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it("devolve 400 para XML bem formado que não é VRSync", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-vrsync",
        headers: authHeaders(app),
        payload: { xmlContent: "<root><foo>bar</foo></root>" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("exige xmlContent no corpo", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/properties/import-vrsync",
        headers: authHeaders(app),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/properties/:id", () => {
    it("should update property status and details", async () => {
      propertyRepo.update = async () => ({
        ...fakeProperty,
        status: "RENTED",
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/properties/${testPropertyId}`,
        headers: authHeaders(app),
        payload: {
          status: "RENTED",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.property.status).toBe("RENTED");
    });
  });

  describe("GET /api/leads/:id/matches", () => {
    const mock360: Lead360View = {
        lead: {
          id: testLeadId,
          tenant_id: testTenantId,
          assigned_user_id: null,
          name: "Carlos",
          phone: "5511999998888",
          instagram_user_id: null,
          email: null,
          source: "WHATSAPP",
          intent: null,
          stage: "QUALIFIED",
          temperature: "HOT",
          score: 80,
          automation_mode: "AI",
          first_contact_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
          last_outbound_at: null,
          next_action_at: null,
          lost_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        profile: {
          transaction_type: "RENT",
          neighborhoods: ["Eloy Chaves"],
          max_budget: 3500,
          bedrooms: 2,
        },
        stageHistory: [],
        activities: [],
        recentMessages: [],
    };

    it("should calculate matching properties for lead profile", async () => {
      leadRepo.findLead360 = async () => mock360;
      propertyRepo.list = async () => [fakeProperty];
      tenantRepo.findById = async () => fakeTenant;

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.matches.length).toBe(1);
      expect(body.matches[0].property.id).toBe(testPropertyId);
      expect(body.matches[0].score).toBeGreaterThanOrEqual(50);
    });

    // --------------------------------------------------------------------------
    // Etapa 15.1 — procedência da disponibilidade junto de cada match
    // --------------------------------------------------------------------------
    it("devolve a procedência da disponibilidade de cada match", async () => {
      leadRepo.findLead360 = async () => mock360;
      propertyRepo.list = async () => [fakeProperty];
      tenantRepo.findById = async () => fakeTenant;

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: authHeaders(app),
      });

      const body = JSON.parse(response.payload);
      expect(body.matches[0].availability.confidence).toBe("FRESH");
      expect(body.matches[0].availability.canAssert).toBe(true);
      expect(body.matches[0].availability.source).toBe("AGENT_CONFIRMED");
      expect(body.needsReconfirmation).toBe(0);
    });

    it("marca como não verificado o imóvel do catálogo legado (sem carimbo)", async () => {
      leadRepo.findLead360 = async () => mock360;
      // Exatamente o estado em que a migration 05 deixa as linhas antigas:
      // ninguém sabe quando a disponibilidade foi conferida.
      propertyRepo.list = async () => [{ ...fakeProperty, availability_verified_at: null }];
      tenantRepo.findById = async () => fakeTenant;

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: authHeaders(app),
      });

      const body = JSON.parse(response.payload);
      expect(body.matches[0].availability.confidence).toBe("UNVERIFIED");
      expect(body.matches[0].availability.canAssert).toBe(false);
      expect(body.needsReconfirmation).toBe(1);
    });

    it("respeita a janela configurada pelo tenant, não a constante padrão", async () => {
      leadRepo.findLead360 = async () => mock360;
      propertyRepo.list = async () => [fakeProperty]; // verificado há 2h
      // Imobiliária de alto giro: só confia em verificação da última hora.
      tenantRepo.findById = async () => ({
        ...fakeTenant,
        availability_fresh_hours: 1,
        availability_stale_hours: 24,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: authHeaders(app),
      });

      const body = JSON.parse(response.payload);
      expect(body.matches[0].availability.canAssert).toBe(false);
      expect(body.needsReconfirmation).toBe(1);
    });

    it("não afirma disponibilidade quando a leitura da política do tenant falha", async () => {
      leadRepo.findLead360 = async () => mock360;
      propertyRepo.list = async () => [{ ...fakeProperty, availability_verified_at: null }];
      tenantRepo.findById = async () => {
        throw new Error("banco indisponível");
      };

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: authHeaders(app),
      });

      // Degrada para o padrão conservador em vez de derrubar a rota.
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.matches[0].availability.canAssert).toBe(false);
    });
  });

  describe("POST /api/leads/:id/matches/:propertyId/suggest", () => {
    it("should record suggested property match", async () => {
      propertyRepo.saveMatch = async () => ({
        id: "match-1",
        tenant_id: testTenantId,
        lead_id: testLeadId,
        property_id: testPropertyId,
        score: 95,
        reasons_json: ["Excelente bairro", "Preço ótimo"],
        status: "SUGGESTED",
        created_at: new Date().toISOString(),
      });
      leadRepo.addActivity = async () => ({ id: "act-match-1" });

      const response = await app.inject({
        method: "POST",
        url: `/api/leads/${testLeadId}/matches/${testPropertyId}/suggest`,
        headers: authHeaders(app),
        payload: {
          score: 95,
          reasons: ["Excelente bairro", "Preço ótimo"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.match.score).toBe(95);
    });
  });
});
