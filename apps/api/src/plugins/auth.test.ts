import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { LeadRepository, ChannelConnectionRepository, type TenantContext } from "@nexora/database";
import { buildApp } from "../app.js";
import {
  authHeaders,
  createAuthTestTenantRepo,
  signTestToken,
  TEST_TENANT_ID,
  TEST_FOREIGN_TENANT_ID,
  TEST_FOREIGN_AUTH_USER_ID,
} from "../test-utils/auth.js";

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Token HS256 assinado com um segredo diferente do da aplicacao. */
function forgeTokenWithWrongSecret(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(
    crypto
      .createHmac("sha256", "segredo-do-atacante")
      .update(header + "." + body)
      .digest(),
  );
  return header + "." + body + "." + signature;
}

/** Token com alg none - o bypass classico de verificacao de JWT. */
function forgeAlgNoneToken(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  return header + "." + body + ".";
}

describe("Autenticação e isolamento de tenant (Etapa 13.1)", () => {
  let app: FastifyInstance;
  let leadRepo: LeadRepository;
  /** Captura o TenantContext que a rota realmente entregou ao repositório. */
  let capturedContext: TenantContext | null = null;

  beforeAll(async () => {
    leadRepo = new LeadRepository();
    leadRepo.listWithFilters = async (ctx: TenantContext) => {
      capturedContext = ctx;
      return { leads: [], total: 0 };
    };

    // Nenhuma conexão de canal cadastrada: todo webhook é recusado.
    const channelRepo = new ChannelConnectionRepository();
    channelRepo.resolveByExternalAccount = async () => null;

    app = await buildApp({ leadRepo, channelRepo, tenantRepo: createAuthTestTenantRepo() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA — invasão de tenant por header
  // --------------------------------------------------------------------------
  describe("TESTE CRÍTICO: invasão de tenant", () => {
    it("recusa token válido do Tenant A apontando para o Tenant B", async () => {
      capturedContext = null;

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: {
          authorization: "Bearer " + signTestToken(app),
          "x-tenant-id": TEST_FOREIGN_TENANT_ID,
        },
      });

      expect(response.statusCode).toBe(403);
      // O repositório não pode nem ter sido chamado: nada vaza do Tenant B.
      expect(capturedContext).toBeNull();
    });

    it("usa o tenant do vínculo, nunca o header, quando ambos são válidos", async () => {
      capturedContext = null;

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.tenantId).toBe(TEST_TENANT_ID);
    });

    it("recusa usuário autenticado sem vínculo ativo com nenhum tenant", async () => {
      capturedContext = null;

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: {
          authorization: "Bearer " + signTestToken(app, { sub: TEST_FOREIGN_AUTH_USER_ID }),
        },
      });

      expect(response.statusCode).toBe(403);
      expect(capturedContext).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe("Validação do token", () => {
    it("recusa requisição sem token", async () => {
      const response = await app.inject({ method: "GET", url: "/api/leads" });
      expect(response.statusCode).toBe(401);
    });

    it("recusa token assinado com outro segredo", async () => {
      const token = forgeTokenWithWrongSecret({
        sub: "11111111-1111-1111-1111-111111111111",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: { authorization: "Bearer " + token },
      });

      expect(response.statusCode).toBe(401);
    });

    it("recusa token com alg none", async () => {
      const token = forgeAlgNoneToken({
        sub: "11111111-1111-1111-1111-111111111111",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: { authorization: "Bearer " + token },
      });

      expect(response.statusCode).toBe(401);
    });

    it("recusa token expirado", async () => {
      const token = app.jwt.sign({
        sub: "11111111-1111-1111-1111-111111111111",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) - 3600,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: { authorization: "Bearer " + token },
      });

      expect(response.statusCode).toBe(401);
    });

    it("recusa token sem identificação de usuário", async () => {
      const token = app.jwt.sign({ aud: "authenticated" }, { expiresIn: "1h" });

      const response = await app.inject({
        method: "GET",
        url: "/api/leads",
        headers: { authorization: "Bearer " + token },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  describe("Níveis de acesso das rotas", () => {
    it("libera /health sem token", async () => {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    });

    it("libera o catálogo público de planos sem token", async () => {
      const response = await app.inject({ method: "GET", url: "/api/saas/plans" });
      expect(response.statusCode).toBe(200);
    });

    it("protege rota de negócio que não declarou nível de acesso (fail closed)", async () => {
      // /api/channels/status não declara config.access; o padrão precisa ser
      // o nível mais restritivo, não o mais permissivo.
      const response = await app.inject({ method: "GET", url: "/api/channels/status" });
      expect(response.statusCode).toBe(401);
    });

    it("exige autenticação no onboarding, mas não vínculo prévio de tenant", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/saas/onboarding",
        headers: {
          authorization: "Bearer " + signTestToken(app, { sub: TEST_FOREIGN_AUTH_USER_ID }),
        },
        payload: {},
      });

      // Sem vínculo de tenant o usuário passa pela autenticação; a rota falha
      // por validação de payload (400), não por autorização.
      expect(response.statusCode).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  describe("Webhooks", () => {
    // O contrato mudou na Etapa 13.4: webhook não usa JWT, mas passou a exigir
    // prova de origem. A cobertura completa vive em `routes/webhooks.test.ts`.
    it("não exige JWT, mas rejeita webhook sem origem comprovada", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/mock",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ event: "messages.upsert", instance: "qualquer" }),
      });

      // 403 (conexão não cadastrada) ou 401 (assinatura ausente): em nenhum
      // caso a mensagem entra.
      expect([401, 403]).toContain(response.statusCode);
    });
  });
});
