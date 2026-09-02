import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { LeadRepository, type LeadProfileData, type ActivityData } from "@nexora/database";
import type { Stage, Channel, AutomationMode, Temperature } from "@nexora/shared";
import { MessageGateway } from "@nexora/messaging";
import { tenantContext, ROLES_ADMIN } from "../plugins/auth.js";

export interface LeadsPluginOptions {
  leadRepo?: LeadRepository;
  gateway?: MessageGateway;
}

export const leadRoutes: FastifyPluginAsync<LeadsPluginOptions> = async (fastify, opts) => {
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const gateway = opts?.gateway || new MessageGateway();

  // ----------------------------------------------------------------------------
  // Listar Leads com Filtros
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/leads",
    async (
      request: FastifyRequest<{
        Querystring: {
          stage?: Stage;
          temperature?: Temperature;
          source?: Channel;
          automation_mode?: AutomationMode;
          search?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { stage, temperature, source, automation_mode, search } = request.query;
      const limit = Number(request.query.limit) || 50;
      const offset = Number(request.query.offset) || 0;

      try {
        const result = await leadRepo.listWithFilters(
          { tenantId },
          { stage, temperature, source, automation_mode, search, limit, offset },
        );

        return reply.status(200).send({
          success: true,
          leads: result.leads,
          total: result.total,
          limit,
          offset,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar leads");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar leads",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Obter Visão Completa Lead 360
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/leads/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const lead360 = await leadRepo.findLead360({ tenantId }, id);
        if (!lead360) {
          return reply.status(404).send({
            success: false,
            error: "Lead não encontrado",
          });
        }

        return reply.status(200).send({
          success: true,
          data: lead360,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao carregar Lead 360");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao carregar Lead 360",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Assumir Conversa (Human Takeover + cancelamento de follow-ups + resumo IA)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/assume",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const result = await gateway.assumeConversation({ tenantId }, id);
        if (!result) {
          return reply.status(404).send({
            success: false,
            error: "Lead não encontrado",
          });
        }

        return reply.status(200).send({
          success: true,
          lead: result.lead,
          cancelledFollowups: result.cancelledFollowups,
          summary: result.summary,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao assumir conversa do lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao assumir conversa",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Atualizar Lead (Estágio, Temperatura, Human Takeover, Responsável)
  // ----------------------------------------------------------------------------
  fastify.patch(
    "/api/leads/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string | null;
          phone?: string | null;
          email?: string | null;
          stage?: Stage;
          temperature?: Temperature;
          score?: number;
          automation_mode?: AutomationMode;
          assigned_user_id?: string | null;
          lost_reason?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const updated = await leadRepo.update({ tenantId }, id, request.body);
        if (!updated) {
          return reply.status(404).send({
            success: false,
            error: "Lead não encontrado para atualização",
          });
        }

        return reply.status(200).send({
          success: true,
          lead: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao atualizar lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao atualizar lead",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Atualizar Perfil Qualificado do Lead (Preferências Imobiliárias)
  // ----------------------------------------------------------------------------
  fastify.put(
    "/api/leads/:id/profile",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: LeadProfileData;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const profile = await leadRepo.upsertProfile({ tenantId }, id, request.body);

        return reply.status(200).send({
          success: true,
          profile,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao salvar perfil do lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao salvar perfil",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Adicionar Nota / Atividade ao Lead
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/activities",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: ActivityData;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      if (!request.body.description) {
        return reply.status(400).send({
          success: false,
          error: "A descrição da atividade é obrigatória.",
        });
      }

      try {
        const result = await leadRepo.addActivity({ tenantId }, id, request.body);

        return reply.status(201).send({
          success: true,
          activityId: result.id,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao criar atividade no lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao criar atividade",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Mudar Estágio do Lead (com auditoria)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/stage",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          stage: Stage;
          reason?: string;
          profileId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      const { stage, reason, profileId } = request.body;
      if (!stage) {
        return reply.status(400).send({
          success: false,
          error: "O novo estágio é obrigatório.",
        });
      }

      try {
        const updated = await leadRepo.changeStage({ tenantId }, id, stage, profileId, reason);

        return reply.status(200).send({
          success: true,
          lead: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao mudar estágio do lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao mudar estágio",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Vincular Identidade de Canal (Telefone / Instagram)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/link-identity",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          phone?: string;
          instagram_user_id?: string;
          email?: string;
          name?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const updated = await leadRepo.linkIdentity({ tenantId }, id, request.body);

        return reply.status(200).send({
          success: true,
          lead: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao vincular identidade ao lead");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao vincular identidade",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Unificar / Merge de Leads de Canais Cruzados (Instagram -> WhatsApp)
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/merge",
    { config: { roles: ROLES_ADMIN } },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { sourceLeadId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: targetLeadId } = request.params;
      const { sourceLeadId } = request.body;
      const { tenantId } = tenantContext(request);

      if (!sourceLeadId) {
        return reply.status(400).send({
          success: false,
          error: "sourceLeadId é obrigatório para unificação.",
        });
      }

      try {
        const unified = await leadRepo.mergeLeads({ tenantId }, targetLeadId, sourceLeadId);

        return reply.status(200).send({
          success: true,
          lead: unified,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao unificar leads");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao unificar leads",
        });
      }
    },
  );
};
