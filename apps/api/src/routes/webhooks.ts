import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { MessageGateway } from "@nexora/messaging";
import {
  ChannelConnectionRepository,
  withTenantTransaction,
  type ResolvedChannelConnection,
} from "@nexora/database";
import type { Channel } from "@nexora/shared";
import { safeCompare } from "@nexora/messaging";

export interface WebhookPluginOptions {
  gateway?: MessageGateway;
  channelRepo?: ChannelConnectionRepository;
  /** Liga a transação de tenant no processamento. Desligado sob NODE_ENV=test. */
  enableTenantSession?: boolean;
}

const WEBHOOK_ACCESS = { config: { access: "webhook" as const } };

/**
 * Token de verificação usado pela Meta no handshake inicial (GET).
 *
 * Sem valor configurado a rota recusa: o fallback anterior era uma string fixa
 * no código, ou seja, um segredo público (CLAUDE.md §35).
 */
function verificationToken(): string | null {
  const token = process.env.WEBHOOK_SECRET;
  if (!token || token.startsWith("placeholder")) return null;
  return token;
}

interface AuthorizedWebhook {
  connection: ResolvedChannelConnection;
}

export const webhookRoutes: FastifyPluginAsync<WebhookPluginOptions> = async (fastify, opts) => {
  const gateway = opts?.gateway || new MessageGateway();
  const channelRepo = opts?.channelRepo || new ChannelConnectionRepository();
  const tenantSessionEnabled = opts?.enableTenantSession ?? process.env.NODE_ENV !== "test";

  /**
   * Prova a origem da requisição e descobre a quem ela pertence.
   *
   * A ordem importa: identificamos a conexão primeiro porque o segredo pode ser
   * dela, e só então verificamos a assinatura. Nenhum dos dois passos aceita
   * `tenant_id` vindo do cliente.
   */
  async function authorize(
    request: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply,
    channel: Channel,
  ): Promise<AuthorizedWebhook | null> {
    const { provider } = request.params;

    let messagingProvider;
    try {
      messagingProvider = gateway.getProvider(channel, provider);
    } catch {
      await reply.status(404).send({ success: false, error: "Provider desconhecido." });
      return null;
    }

    const accountId = messagingProvider.extractAccountId(request.body);
    if (!accountId) {
      request.log.warn({ channel, provider }, "Webhook sem identificação de conta — descartado");
      await reply.status(400).send({
        success: false,
        error: "Payload sem identificação da conta do provider.",
      });
      return null;
    }

    let connection: ResolvedChannelConnection | null;
    try {
      connection = await channelRepo.resolveByExternalAccount(channel, provider, accountId);
    } catch (err) {
      // Banco indisponível não pode virar 500 com a mensagem do Postgres no
      // corpo. 503 diz ao provider para reenviar depois.
      request.log.error(err, "Falha ao resolver conexão de canal");
      await reply.status(503).send({ success: false, error: "Serviço indisponível." });
      return null;
    }

    if (!connection) {
      request.log.warn(
        { channel, provider, accountId },
        "Webhook para conta de canal não cadastrada — descartado",
      );
      // 403 e não 404: não confirmamos ao remetente se a conta existe.
      await reply.status(403).send({ success: false, error: "Conexão de canal não autorizada." });
      return null;
    }

    if (!request.rawBody) {
      request.log.error("Corpo cru indisponível: verificação de assinatura impossível");
      await reply.status(400).send({ success: false, error: "Corpo da requisição inválido." });
      return null;
    }

    const verification = messagingProvider.verifyWebhookSignature({
      rawBody: request.rawBody,
      headers: request.headers,
      connectionSecret: connection.webhookSecret,
    });

    if (!verification.valid) {
      request.log.warn(
        { channel, provider, accountId, reason: verification.reason },
        "Webhook com origem não comprovada — recusado",
      );
      await reply.status(401).send({ success: false, error: "Origem não autorizada." });
      return null;
    }

    return { connection };
  }

  /** Executa o processamento no tenant resolvido, com RLS quando habilitado. */
  async function inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (!tenantSessionEnabled) return fn();
    return withTenantTransaction({ tenantId }, fn);
  }

  /** Handshake de verificação da Meta, comum a WhatsApp Cloud e Instagram. */
  function handleChallenge(
    request: FastifyRequest<{
      Querystring: {
        "hub.mode"?: string;
        "hub.challenge"?: string;
        "hub.verify_token"?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const expected = verificationToken();
    if (!expected) {
      request.log.error("WEBHOOK_SECRET não configurado: handshake recusado");
      return reply.status(503).send({ error: "Verificação de webhook não configurada." });
    }

    const mode = request.query["hub.mode"];
    const challenge = request.query["hub.challenge"];
    const token = request.query["hub.verify_token"];

    if (mode === "subscribe" && token && safeCompare(token, expected)) {
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send({ error: "Token de verificação inválido" });
  }

  // ----------------------------------------------------------------------------
  // WhatsApp
  // ----------------------------------------------------------------------------
  fastify.get("/webhooks/whatsapp/:provider", WEBHOOK_ACCESS, handleChallenge);

  fastify.post(
    "/webhooks/whatsapp/:provider",
    WEBHOOK_ACCESS,
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const authorized = await authorize(request, reply, "WHATSAPP");
      if (!authorized) return reply;

      const { provider } = request.params;
      const tenantId = authorized.connection.tenantId;
      const body = request.body as Record<string, unknown>;

      try {
        const isStatusUpdate =
          body?.event === "messages.update" || body?.event === "message.update";

        if (isStatusUpdate) {
          const prov = gateway.getProvider("WHATSAPP", provider);
          const delivery = prov.getDeliveryStatus(body);

          if (delivery.externalMessageId && delivery.externalMessageId !== "unknown") {
            await inTenant(tenantId, () =>
              gateway.updateDeliveryStatus(
                { tenantId },
                delivery.externalMessageId,
                delivery.status,
              ),
            );
          }

          return reply.status(200).send({
            success: true,
            statusUpdated: true,
            status: delivery.status,
            externalMessageId: delivery.externalMessageId,
          });
        }

        const normalized = gateway.normalizeInbound("WHATSAPP", provider, request.body, tenantId);
        const result = await inTenant(tenantId, () =>
          gateway.processInbound({ tenantId }, normalized),
        );

        return reply.status(200).send({
          success: true,
          duplicate: result.isDuplicate,
          leadId: result.lead.id,
          conversationId: result.conversation.id,
          messageId: result.message.id,
          automationMode: result.automationMode,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao processar webhook de WhatsApp");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro interno ao processar mensagem",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Instagram
  // ----------------------------------------------------------------------------
  fastify.get("/webhooks/instagram/:provider", WEBHOOK_ACCESS, handleChallenge);

  fastify.post(
    "/webhooks/instagram/:provider",
    WEBHOOK_ACCESS,
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const authorized = await authorize(request, reply, "INSTAGRAM");
      if (!authorized) return reply;

      const { provider } = request.params;
      const tenantId = authorized.connection.tenantId;

      try {
        const normalized = gateway.normalizeInbound("INSTAGRAM", provider, request.body, tenantId);
        const result = await inTenant(tenantId, () =>
          gateway.processInbound({ tenantId }, normalized),
        );

        return reply.status(200).send({
          success: true,
          duplicate: result.isDuplicate,
          leadId: result.lead.id,
          conversationId: result.conversation.id,
          messageId: result.message.id,
          automationMode: result.automationMode,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao processar webhook de Instagram");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro interno ao processar mensagem",
        });
      }
    },
  );
};
