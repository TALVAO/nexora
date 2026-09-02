import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { LeadRepository, VisitRepository } from "@nexora/database";
import { CRMSyncService, type CRMSyncMode, type TenantCRMConfig } from "@nexora/crm";
import { tenantContext, ROLES_ADMIN } from "../plugins/auth.js";

export interface CRMPluginOptions {
  leadRepo?: LeadRepository;
  visitRepo?: VisitRepository;
  crmService?: CRMSyncService;
}

export const crmRoutes: FastifyPluginAsync<CRMPluginOptions> = async (fastify, opts) => {
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const visitRepo = opts?.visitRepo || new VisitRepository();
  const crmService = opts?.crmService || new CRMSyncService();

  // ----------------------------------------------------------------------------
  // Obter Configuração de Sincronização CRM
  // ----------------------------------------------------------------------------
  fastify.get("/api/crm/config", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = tenantContext(request);

    const config = crmService.getConfig(tenantId);
    return reply.status(200).send({
      success: true,
      config,
    });
  });

  // ----------------------------------------------------------------------------
  // Atualizar Configuração de Sincronização CRM
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/crm/config",
    { config: { roles: ROLES_ADMIN } },
    async (
      request: FastifyRequest<{
        Body: {
          mode: CRMSyncMode;
          isEnabled?: boolean;
          apiUrl?: string;
          apiKey?: string;
          webhookUrl?: string;
          customHeaders?: Record<string, string>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { mode, isEnabled = true, apiUrl, apiKey, webhookUrl, customHeaders } = request.body;

      if (!mode) {
        return reply.status(400).send({
          success: false,
          error: "O modo de sincronização (mode) é obrigatório.",
        });
      }

      const newConfig: TenantCRMConfig = {
        tenantId,
        mode,
        isEnabled,
        apiUrl: apiUrl || null,
        apiKey: apiKey || null,
        webhookUrl: webhookUrl || null,
        customHeaders: customHeaders || {},
      };

      crmService.setConfig(newConfig);

      return reply.status(200).send({
        success: true,
        config: newConfig,
      });
    },
  );

  // ----------------------------------------------------------------------------
  // Sincronizar Lead Qualificado com CRM Externo
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/crm/sync/lead/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: leadId } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const lead360 = await leadRepo.findLead360({ tenantId }, leadId);
        if (!lead360) {
          return reply.status(404).send({
            success: false,
            error: "Lead não encontrado.",
          });
        }

        const syncResult = await crmService.syncQualifiedLead(tenantId, {
          leadId: lead360.lead.id,
          name: lead360.lead.name,
          phone: lead360.lead.phone,
          email: lead360.lead.email,
          instagramUserId: lead360.lead.instagram_user_id,
          stage: lead360.lead.stage,
          score: lead360.lead.score,
          temperature: lead360.lead.temperature,
          profile: lead360.profile
            ? {
                transactionType: lead360.profile.transaction_type,
                propertyType: lead360.profile.property_type,
                city: lead360.profile.city,
                neighborhoods: lead360.profile.neighborhoods,
                maxBudget: lead360.profile.max_budget,
                bedrooms: lead360.profile.bedrooms,
              }
            : null,
        });

        await leadRepo.addActivity({ tenantId }, leadId, {
          activity_type: "NOTE",
          description: `[CRM_SYNC] Sincronização com CRM externo (${syncResult.mode}): ${syncResult.success ? "Sucesso" : syncResult.error}`,
        });

        return reply.status(200).send({
          success: syncResult.success,
          result: syncResult,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao sincronizar lead com CRM");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao sincronizar lead",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Sincronizar Visita com CRM Externo
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/crm/sync/visit/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: visitId } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const visit = await visitRepo.findById({ tenantId }, visitId);
        if (!visit) {
          return reply.status(404).send({
            success: false,
            error: "Visita não encontrada.",
          });
        }

        const syncResult = await crmService.syncVisit(tenantId, {
          visitId: visit.id,
          leadId: visit.lead_id,
          propertyId: visit.property_id,
          scheduledAt: visit.scheduled_at,
          status: visit.status,
          feedback: visit.feedback,
        });

        return reply.status(200).send({
          success: syncResult.success,
          result: syncResult,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao sincronizar visita com CRM");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao sincronizar visita",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Exportar Leads Qualificados em CSV para CRM Legado
  // ----------------------------------------------------------------------------
  fastify.get("/api/crm/export/csv", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = tenantContext(request);

    try {
      const { leads } = await leadRepo.listWithFilters({ tenantId }, { limit: 1000 });
      const inputs = leads.map((l) => ({
        leadId: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        instagramUserId: l.instagram_user_id,
        stage: l.stage,
        score: l.score,
        temperature: l.temperature,
      }));

      const csvData = crmService.exportLeadsToCsv(inputs);

      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", 'attachment; filename="leads-nexora-crm.csv"');
      return reply.status(200).send(csvData);
    } catch (err: unknown) {
      request.log.error(err, "Erro ao exportar leads para CSV");
      return reply.status(500).send({
        success: false,
        error: err instanceof Error ? err.message : "Erro ao exportar CSV",
      });
    }
  });
};
