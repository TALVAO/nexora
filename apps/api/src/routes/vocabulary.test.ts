import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Role } from "@nexora/shared";
import { VocabularyRepository, type TenantLocationRow } from "@nexora/database";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo, TEST_TENANT_ID } from "../test-utils/auth.js";

interface Registered {
  kind: string;
  name: string;
  parentCity?: string | null;
}

function fakeLocation(name: string, kind = "NEIGHBORHOOD"): TenantLocationRow {
  return {
    id: "11111111-aaaa-4bbb-8ccc-000000000001",
    tenant_id: TEST_TENANT_ID,
    kind: kind as TenantLocationRow["kind"],
    name,
    normalized_name: name.toLowerCase(),
    parent_city_normalized: "jundiai",
    aliases: [],
    source: "MANUAL",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function buildAppAsRole(
  role: Role,
  captured: Registered[] = [],
): Promise<{ app: FastifyInstance; captured: Registered[] }> {
  const vocabularyRepo = new VocabularyRepository();

  vocabularyRepo.listLocations = async () => [fakeLocation("Eloy Chaves")];
  vocabularyRepo.listVocabulary = async () => [];
  vocabularyRepo.registerLocation = async (_ctx, input) => {
    captured.push({ kind: input.kind, name: input.name, parentCity: input.parentCity });
    return fakeLocation(input.name, input.kind);
  };
  vocabularyRepo.deactivateLocation = async () => true;
  vocabularyRepo.backfillFromProperties = async () => ({ registered: 7 });
  vocabularyRepo.upsertVocabularyTerm = async () => undefined;

  const app = await buildApp({
    vocabularyRepo,
    tenantRepo: createAuthTestTenantRepo(undefined, role),
  });
  await app.ready();
  return { app, captured };
}

describe("Rotas de geografia e vocabulário (Etapa 13.3)", () => {
  let owner: FastifyInstance;
  let agent: FastifyInstance;
  let viewer: FastifyInstance;
  let ownerCaptured: Registered[];

  beforeAll(async () => {
    const o = await buildAppAsRole("OWNER");
    owner = o.app;
    ownerCaptured = o.captured;
    agent = (await buildAppAsRole("AGENT")).app;
    viewer = (await buildAppAsRole("VIEWER")).app;
  });

  afterAll(async () => {
    await Promise.all([owner.close(), agent.close(), viewer.close()]);
  });

  describe("Leitura", () => {
    it("qualquer membro do tenant lista a geografia", async () => {
      const response = await agent.inject({
        method: "GET",
        url: "/api/tenant/locations",
        headers: authHeaders(agent),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.locations[0].name).toBe("Eloy Chaves");
    });

    it("exige autenticação", async () => {
      const response = await agent.inject({ method: "GET", url: "/api/tenant/locations" });
      expect(response.statusCode).toBe(401);
    });

    it("recusa kind inválido", async () => {
      const response = await agent.inject({
        method: "GET",
        url: "/api/tenant/locations?kind=PLANETA",
        headers: authHeaders(agent),
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("Escrita", () => {
    it("OWNER cadastra bairro informando a cidade", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(owner),
        payload: { kind: "NEIGHBORHOOD", name: "Boa Viagem", parentCity: "Recife" },
      });

      expect(response.statusCode).toBe(201);
      expect(ownerCaptured).toContainEqual({
        kind: "NEIGHBORHOOD",
        name: "Boa Viagem",
        parentCity: "Recife",
      });
    });

    it("recusa bairro sem cidade — senão 'Centro' de duas cidades colide", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(owner),
        payload: { kind: "NEIGHBORHOOD", name: "Centro" },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toContain("parentCity");
    });

    it("bloqueia AGENT de cadastrar geografia", async () => {
      const response = await agent.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(agent),
        payload: { kind: "CITY", name: "Curitiba" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("bloqueia VIEWER de escrever", async () => {
      const response = await viewer.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(viewer),
        payload: { kind: "CITY", name: "Curitiba" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("OWNER desativa uma localização", async () => {
      const response = await owner.inject({
        method: "DELETE",
        url: "/api/tenant/locations/11111111-aaaa-4bbb-8ccc-000000000001",
        headers: authHeaders(owner),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe("Backfill do catálogo", () => {
    it("OWNER deriva geografia dos imóveis já cadastrados", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations/backfill",
        headers: authHeaders(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).registered).toBe(7);
    });

    it("bloqueia AGENT no backfill", async () => {
      const response = await agent.inject({
        method: "POST",
        url: "/api/tenant/locations/backfill",
        headers: authHeaders(agent),
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("Vocabulário de negócio", () => {
    it("OWNER cadastra termo próprio da imobiliária", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/vocabulary",
        headers: authHeaders(owner),
        payload: {
          category: "RENTAL_GUARANTEE",
          canonicalValue: "Garantti",
          aliases: ["garanti", "garantti"],
        },
      });
      expect(response.statusCode).toBe(201);
    });

    it("recusa categoria inválida", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/vocabulary",
        headers: authHeaders(owner),
        payload: { category: "COR_DA_PAREDE", canonicalValue: "Azul" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("recusa termo vazio", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/vocabulary",
        headers: authHeaders(owner),
        payload: { category: "PROPERTY_TYPE", canonicalValue: "   " },
      });
      expect(response.statusCode).toBe(400);
    });
  });
  // --------------------------------------------------------------------------
  // Regressões da verificação adversarial: entradas que devolviam 500
  // --------------------------------------------------------------------------
  describe("Validação de fronteira", () => {
    it("query vazia (?kind=) é ausência de filtro, não erro", async () => {
      const response = await agent.inject({
        method: "GET",
        url: "/api/tenant/locations?kind=",
        headers: authHeaders(agent),
      });
      expect(response.statusCode).toBe(200);
    });

    it("category vazia (?category=) também", async () => {
      const response = await agent.inject({
        method: "GET",
        url: "/api/tenant/vocabulary?category=",
        headers: authHeaders(agent),
      });
      expect(response.statusCode).toBe(200);
    });

    it("id fora do formato UUID devolve 400, não 500", async () => {
      const response = await owner.inject({
        method: "DELETE",
        url: "/api/tenant/locations/nao-e-uuid",
        headers: authHeaders(owner),
      });
      expect(response.statusCode).toBe(400);
    });

    it("name de tipo errado devolve 400 sem vazar erro interno", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(owner),
        payload: { kind: "CITY", name: 123 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.payload).not.toContain("is not a function");
    });

    it("aliases que não é array devolve 400", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(owner),
        payload: { kind: "CITY", name: "Recife", aliases: "recife" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("canonicalValue de tipo errado devolve 400", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/vocabulary",
        headers: authHeaders(owner),
        payload: { category: "PROPERTY_TYPE", canonicalValue: 123 },
      });
      expect(response.statusCode).toBe(400);
    });

    it("nome absurdamente longo é recusado", async () => {
      const response = await owner.inject({
        method: "POST",
        url: "/api/tenant/locations",
        headers: authHeaders(owner),
        payload: { kind: "CITY", name: "x".repeat(5000) },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
