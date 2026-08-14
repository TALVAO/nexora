import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import {
  PropertyRepository,
  LeadRepository,
  type PropertyRow,
  type Lead360View,
} from "@nexora/database";
import { PropertyMatcher, CsvPropertyImporter } from "@nexora/messaging";

describe("Properties & Matchmaking API Routes Integration (Etapa 8)", () => {
  let app: FastifyInstance;
  let propertyRepo: PropertyRepository;
  let leadRepo: LeadRepository;
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
    url: "https://site.com/AP001",
    main_image_url: "https://site.com/AP001.jpg",
    metadata_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    propertyRepo = new PropertyRepository();
    leadRepo = new LeadRepository();
    matcher = new PropertyMatcher();
    csvImporter = new CsvPropertyImporter();

    app = await buildApp({
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
        headers: { "x-tenant-id": testTenantId },
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
        headers: { "x-tenant-id": testTenantId },
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
        headers: { "x-tenant-id": testTenantId },
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
        headers: { "x-tenant-id": testTenantId },
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
        headers: { "x-tenant-id": testTenantId },
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

  describe("PATCH /api/properties/:id", () => {
    it("should update property status and details", async () => {
      propertyRepo.update = async () => ({
        ...fakeProperty,
        status: "RENTED",
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/properties/${testPropertyId}`,
        headers: { "x-tenant-id": testTenantId },
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
    it("should calculate matching properties for lead profile", async () => {
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

      leadRepo.findLead360 = async () => mock360;
      propertyRepo.list = async () => [fakeProperty];

      const response = await app.inject({
        method: "GET",
        url: `/api/leads/${testLeadId}/matches?minScore=50`,
        headers: { "x-tenant-id": testTenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.matches.length).toBe(1);
      expect(body.matches[0].property.id).toBe(testPropertyId);
      expect(body.matches[0].score).toBeGreaterThanOrEqual(50);
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
        headers: { "x-tenant-id": testTenantId },
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
