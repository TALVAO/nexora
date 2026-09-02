import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { MessageGateway, type MessageType } from "@nexora/messaging";
import { EvolutionWhatsAppProvider } from "@nexora/messaging";
import { MessageRepository } from "@nexora/database";
import { tenantContext } from "../plugins/auth.js";

export interface ConversationPluginOptions {
  gateway?: MessageGateway;
  messageRepo?: MessageRepository;
  evolutionProvider?: EvolutionWhatsAppProvider;
}

export const conversationRoutes: FastifyPluginAsync<ConversationPluginOptions> = async (
  fastify,
  opts,
) => {
  const gateway = opts?.gateway || new MessageGateway();
  const messageRepo = opts?.messageRepo || new MessageRepository();
  const evolutionProvider = opts?.evolutionProvider || new EvolutionWhatsAppProvider();

  // ----------------------------------------------------------------------------
  // Enviar Mensagem Manual para a Conversa (WhatsApp Outbound)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/conversations/:id/messages",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          text?: string;
          mediaUrl?: string;
          type?: MessageType;
          caption?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: conversationId } = request.params;
      const { tenantId } = tenantContext(request);

      const { text, mediaUrl, type, caption } = request.body || {};

      if (!text && !mediaUrl) {
        return reply.status(400).send({
          success: false,
          error: "A mensagem deve conter texto ou URL de mídia.",
        });
      }

      try {
        const result = await gateway.sendOutbound({ tenantId }, conversationId, {
          text,
          mediaUrl,
          type,
          caption,
          senderType: "USER",
        });

        if (!result.success) {
          return reply.status(422).send({
            success: false,
            error: result.error,
          });
        }

        return reply.status(200).send({
          success: true,
          message: result.message,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao enviar mensagem na conversa");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao enviar mensagem",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Listar Mensagens de uma Conversa
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/conversations/:id/messages",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: conversationId } = request.params;
      const { tenantId } = tenantContext(request);
      const limit = Number(request.query.limit) || 50;

      try {
        const messages = await messageRepo.listByConversation({ tenantId }, conversationId, limit);

        return reply.status(200).send({
          success: true,
          messages,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar mensagens da conversa");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar mensagens",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Checar Status de Conexão dos Canais (Evolution / WhatsApp)
  // ----------------------------------------------------------------------------
  fastify.get("/api/channels/status", async (_request, reply) => {
    const status = await evolutionProvider.getConnectionStatus();

    return reply.status(200).send({
      success: true,
      channels: {
        whatsapp: {
          provider: "evolution",
          ...status,
        },
      },
    });
  });
};
