import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { MessageGateway } from "@nexora/messaging";

export interface WebhookPluginOptions {
  gateway?: MessageGateway;
}

export const webhookRoutes: FastifyPluginAsync<WebhookPluginOptions> = async (fastify, opts) => {
  const gateway = opts?.gateway || new MessageGateway();

  // ----------------------------------------------------------------------------
  // WhatsApp Webhooks
  // ----------------------------------------------------------------------------

  // Verification challenge (Meta WhatsApp Cloud API)
  fastify.get(
    "/webhooks/whatsapp/:provider",
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: {
          "hub.mode"?: string;
          "hub.challenge"?: string;
          "hub.verify_token"?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const mode = request.query["hub.mode"];
      const challenge = request.query["hub.challenge"];
      const token = request.query["hub.verify_token"];

      const expectedToken = process.env.WEBHOOK_SECRET || "nexora-webhook-secret";

      if (mode === "subscribe" && token === expectedToken) {
        return reply.status(200).send(challenge);
      }

      return reply.status(403).send({ error: "Token de verificação inválido" });
    },
  );

  // Inbound WhatsApp Message / Status Update (Evolution API, Meta Cloud, Mock)
  fastify.post(
    "/webhooks/whatsapp/:provider",
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: { tenant_id?: string };
        Headers: { "x-tenant-id"?: string; "x-webhook-secret"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { provider } = request.params;
      const tenantId =
        request.headers["x-tenant-id"] ||
        request.query.tenant_id ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      const body = request.body as Record<string, unknown>;

      try {
        // Check if payload is a status update event (e.g. messages.update in Evolution API)
        const isStatusUpdate =
          body?.event === "messages.update" ||
          body?.event === "message.update" ||
          (Array.isArray((body?.entry as unknown[])?.[0]) && false);

        if (isStatusUpdate) {
          const prov = gateway.getProvider("WHATSAPP", provider);
          const delivery = prov.getDeliveryStatus(body);
          if (delivery.externalMessageId && delivery.externalMessageId !== "unknown") {
            await gateway.updateDeliveryStatus(
              { tenantId },
              delivery.externalMessageId,
              delivery.status,
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

        const result = await gateway.processInbound({ tenantId }, normalized);

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
  // Instagram Webhooks
  // ----------------------------------------------------------------------------

  // Verification challenge (Instagram Graph API)
  fastify.get(
    "/webhooks/instagram/:provider",
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: {
          "hub.mode"?: string;
          "hub.challenge"?: string;
          "hub.verify_token"?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const mode = request.query["hub.mode"];
      const challenge = request.query["hub.challenge"];
      const token = request.query["hub.verify_token"];

      const expectedToken = process.env.WEBHOOK_SECRET || "nexora-webhook-secret";

      if (mode === "subscribe" && token === expectedToken) {
        return reply.status(200).send(challenge);
      }

      return reply.status(403).send({ error: "Token de verificação inválido" });
    },
  );

  // Inbound Instagram Message
  fastify.post(
    "/webhooks/instagram/:provider",
    async (
      request: FastifyRequest<{
        Params: { provider: string };
        Querystring: { tenant_id?: string };
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { provider } = request.params;
      const tenantId =
        request.headers["x-tenant-id"] ||
        request.query.tenant_id ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

      try {
        const normalized = gateway.normalizeInbound("INSTAGRAM", provider, request.body, tenantId);

        const result = await gateway.processInbound({ tenantId }, normalized);

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
