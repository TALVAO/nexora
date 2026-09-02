import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MessageGateway } from "@nexora/messaging";
import {
  ChannelConnectionRepository,
  type LeadRow,
  type ConversationRow,
  type MessageRow,
  type ResolvedChannelConnection,
} from "@nexora/database";

/**
 * Segurança de origem dos webhooks (Etapa 13.4).
 *
 * Antes desta etapa a rota aceitava qualquer requisição e lia o tenant de
 * `x-tenant-id`: quem soubesse um UUID injetava mensagem na conta alheia.
 */

const TENANT_DONO = "a0000000-0000-0000-0000-000000000001";
const TENANT_INVASOR = "b0000000-0000-0000-0000-000000000002";

const INSTANCIA_EVOLUTION = "nexora-piloto";
const CONTA_INSTAGRAM = "ig_account_do_tenant";
const SEGREDO_EVOLUTION = "token-secreto-da-conexao-evolution";
const SEGREDO_META = "app-secret-da-meta";

function conexao(overrides: Partial<ResolvedChannelConnection> = {}): ResolvedChannelConnection {
  return {
    connectionId: "conn-1",
    tenantId: TENANT_DONO,
    channel: "WHATSAPP",
    provider: "evolution",
    externalAccountId: INSTANCIA_EVOLUTION,
    status: "CONNECTED",
    webhookSecret: SEGREDO_EVOLUTION,
    ...overrides,
  };
}

/** Repositório de teste: só reconhece as duas contas cadastradas. */
function createChannelRepo(): ChannelConnectionRepository {
  const repo = new ChannelConnectionRepository();
  repo.resolveByExternalAccount = async (channel, provider, accountId) => {
    if (channel === "WHATSAPP" && accountId === INSTANCIA_EVOLUTION) {
      return conexao({ provider });
    }
    if (channel === "INSTAGRAM" && accountId === CONTA_INSTAGRAM) {
      return conexao({
        channel: "INSTAGRAM",
        provider,
        externalAccountId: CONTA_INSTAGRAM,
        webhookSecret: SEGREDO_META,
      });
    }
    return null;
  };
  return repo;
}

const payloadEvolution = {
  event: "messages.upsert",
  instance: INSTANCIA_EVOLUTION,
  data: {
    key: { id: "evo_msg_1", remoteJid: "5511999991111@s.whatsapp.net" },
    message: { conversation: "Boa tarde, busco imóvel de 2 quartos" },
  },
};

const payloadInstagram = {
  object: "instagram",
  entry: [
    {
      id: CONTA_INSTAGRAM,
      messaging: [
        { sender: { id: "ig_user_99" }, message: { mid: "m_123", text: "Vi o imóvel no feed" } },
      ],
    },
  ],
};

/** Corpo enviado como string para controlar os bytes exatos assinados. */
function corpo(obj: unknown): string {
  return JSON.stringify(obj);
}

function assinaturaMeta(raw: string, segredo = SEGREDO_META): string {
  return "sha256=" + crypto.createHmac("sha256", segredo).update(raw).digest("hex");
}

const jsonHeaders = { "content-type": "application/json" };

describe("Segurança de origem dos webhooks (Etapa 13.4)", () => {
  let app: FastifyInstance;
  let gateway: MessageGateway;
  let processados: Array<{ tenantId: string }>;

  const fakeLead = { id: "lead-wh-001", automation_mode: "AI" } as LeadRow;
  const fakeConversation = { id: "conv-wh-001" } as ConversationRow;
  const fakeMessage = { id: "msg-wh-001" } as MessageRow;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = "token-de-verificacao-do-handshake";

    gateway = new MessageGateway();
    app = await buildApp({ gateway, channelRepo: createChannelRepo() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    processados = [];
    gateway.processInbound = async (ctx) => {
      processados.push({ tenantId: ctx.tenantId });
      return {
        isDuplicate: false,
        lead: fakeLead,
        conversation: fakeConversation,
        message: fakeMessage,
        automationMode: "AI",
      };
    };
  });

  // --------------------------------------------------------------------------
  // TESTE CRÍTICO DA ETAPA
  // --------------------------------------------------------------------------
  describe("TESTE CRÍTICO: origem não comprovada não entra", () => {
    it("recusa webhook sem assinatura e não processa nada", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: jsonHeaders,
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(401);
      expect(processados).toEqual([]);
    });

    it("recusa token de webhook errado", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: { ...jsonHeaders, "x-webhook-token": "token-do-atacante" },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(401);
      expect(processados).toEqual([]);
    });

    it("IGNORA x-tenant-id: a mensagem cai no tenant da conexão", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: {
          ...jsonHeaders,
          "x-webhook-token": SEGREDO_EVOLUTION,
          "x-tenant-id": TENANT_INVASOR,
        },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(200);
      expect(processados).toEqual([{ tenantId: TENANT_DONO }]);
    });

    it("IGNORA ?tenant_id da query", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/webhooks/whatsapp/evolution?tenant_id=${TENANT_INVASOR}`,
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(200);
      expect(processados).toEqual([{ tenantId: TENANT_DONO }]);
    });

    it("recusa conta de canal não cadastrada", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo({ ...payloadEvolution, instance: "instancia-desconhecida" }),
      });

      expect(response.statusCode).toBe(403);
      expect(processados).toEqual([]);
    });

    it("recusa payload sem identificação da conta", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo({ event: "messages.upsert", data: {} }),
      });

      expect(response.statusCode).toBe(400);
      expect(processados).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  describe("Assinatura HMAC da Meta", () => {
    it("aceita assinatura válida sobre o corpo exato", async () => {
      const raw = corpo(payloadInstagram);

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/instagram/instagram_graph",
        headers: { ...jsonHeaders, "x-hub-signature-256": assinaturaMeta(raw) },
        payload: raw,
      });

      expect(response.statusCode).toBe(200);
      expect(processados).toEqual([{ tenantId: TENANT_DONO }]);
    });

    it("recusa assinatura calculada com outro segredo", async () => {
      const raw = corpo(payloadInstagram);

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/instagram/instagram_graph",
        headers: {
          ...jsonHeaders,
          "x-hub-signature-256": assinaturaMeta(raw, "segredo-do-atacante"),
        },
        payload: raw,
      });

      expect(response.statusCode).toBe(401);
      expect(processados).toEqual([]);
    });

    it("recusa corpo adulterado depois de assinado", async () => {
      const original = corpo(payloadInstagram);
      const assinatura = assinaturaMeta(original);

      const adulterado = corpo({
        ...payloadInstagram,
        entry: [
          {
            id: CONTA_INSTAGRAM,
            messaging: [
              {
                sender: { id: "ig_user_99" },
                message: { mid: "m_123", text: "TEXTO TROCADO PELO ATACANTE" },
              },
            ],
          },
        ],
      });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/instagram/instagram_graph",
        headers: { ...jsonHeaders, "x-hub-signature-256": assinatura },
        payload: adulterado,
      });

      expect(response.statusCode).toBe(401);
      expect(processados).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  describe("Handshake de verificação da Meta", () => {
    it("devolve o challenge quando o token confere", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/webhooks/whatsapp/meta_cloud?hub.mode=subscribe&hub.verify_token=token-de-verificacao-do-handshake&hub.challenge=1158201444",
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toBe("1158201444");
    });

    it("recusa token de verificação errado", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/webhooks/whatsapp/meta_cloud?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1158201444",
      });

      expect(response.statusCode).toBe(403);
    });

    it("recusa handshake quando WEBHOOK_SECRET não está configurado", async () => {
      const anterior = process.env.WEBHOOK_SECRET;
      delete process.env.WEBHOOK_SECRET;

      const response = await app.inject({
        method: "GET",
        url: "/webhooks/instagram/instagram_graph?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=1",
      });

      expect(response.statusCode).toBe(503);
      process.env.WEBHOOK_SECRET = anterior;
    });
  });

  // --------------------------------------------------------------------------
  describe("Fluxo normal preservado", () => {
    it("processa mensagem autêntica e devolve os ids", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.duplicate).toBe(false);
      expect(body.leadId).toBe("lead-wh-001");
      expect(body.messageId).toBe("msg-wh-001");
    });

    it("reconhece webhook duplicado sem falhar", async () => {
      gateway.processInbound = async () => ({
        isDuplicate: true,
        lead: fakeLead,
        conversation: fakeConversation,
        message: fakeMessage,
        automationMode: "AI",
      });

      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/evolution",
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).duplicate).toBe(true);
    });

    it("recusa provider desconhecido", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/whatsapp/provider_inexistente",
        headers: { ...jsonHeaders, "x-webhook-token": SEGREDO_EVOLUTION },
        payload: corpo(payloadEvolution),
      });

      expect(response.statusCode).toBe(404);
      expect(processados).toEqual([]);
    });
  });
});
