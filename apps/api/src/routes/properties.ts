import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  PropertyRepository,
  LeadRepository,
  TenantRepository,
  type CreatePropertyInput,
} from "@nexora/database";
import { PropertyMatcher, CsvPropertyImporter, VrSyncPropertyImporter } from "@nexora/messaging";
import { assessAvailability, type AvailabilityPolicy } from "@nexora/domain";
import type { PropertyStatus } from "@nexora/shared";
import { tenantContext } from "../plugins/auth.js";

export interface PropertyPluginOptions {
  propertyRepo?: PropertyRepository;
  leadRepo?: LeadRepository;
  tenantRepo?: TenantRepository;
  matcher?: PropertyMatcher;
  csvImporter?: CsvPropertyImporter;
  vrsyncImporter?: VrSyncPropertyImporter;
}

export const propertyRoutes: FastifyPluginAsync<PropertyPluginOptions> = async (fastify, opts) => {
  const propertyRepo = opts?.propertyRepo || new PropertyRepository();
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const tenantRepo = opts?.tenantRepo || new TenantRepository();
  const matcher = opts?.matcher || new PropertyMatcher();
  const csvImporter = opts?.csvImporter || new CsvPropertyImporter();
  const vrsyncImporter = opts?.vrsyncImporter || new VrSyncPropertyImporter();

  /**
   * Janela de validade da verificação de disponibilidade deste tenant. Se a
   * leitura falhar, devolve `null` e o domínio cai no padrão conservador —
   * degradar não pode virar "afirmar disponibilidade sem regra".
   */
  async function loadAvailabilityPolicy(tenantId: string): Promise<AvailabilityPolicy | null> {
    try {
      const tenant = await tenantRepo.findById(tenantId);
      if (!tenant) return null;
      return {
        freshHours: tenant.availability_fresh_hours,
        staleHours: tenant.availability_stale_hours,
      };
    } catch (err) {
      fastify.log.error(err, "Falha ao ler a política de disponibilidade do tenant");
      return null;
    }
  }

  // ----------------------------------------------------------------------------
  // Listar Propriedades com Filtros Determinísticos
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/properties",
    async (
      request: FastifyRequest<{
        Querystring: {
          transactionType?: string;
          propertyType?: string;
          city?: string;
          neighborhood?: string;
          minPrice?: string;
          maxPrice?: string;
          bedrooms?: string;
          petsAllowed?: string;
          status?: PropertyStatus;
          search?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { transactionType, propertyType, city, neighborhood, status, search } = request.query;

      const minPrice = request.query.minPrice ? Number(request.query.minPrice) : undefined;
      const maxPrice = request.query.maxPrice ? Number(request.query.maxPrice) : undefined;
      const bedrooms = request.query.bedrooms ? Number(request.query.bedrooms) : undefined;
      const petsAllowed =
        request.query.petsAllowed === "true"
          ? true
          : request.query.petsAllowed === "false"
            ? false
            : undefined;
      const limit = Number(request.query.limit) || 50;
      const offset = Number(request.query.offset) || 0;

      try {
        const properties = await propertyRepo.list(
          { tenantId },
          {
            transactionType,
            propertyType,
            city,
            neighborhood,
            minPrice,
            maxPrice,
            bedrooms,
            petsAllowed,
            status,
            search,
            limit,
            offset,
          },
        );

        return reply.status(200).send({
          success: true,
          properties,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao listar imóveis");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao listar imóveis",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Obter Detalhes do Imóvel
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/properties/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const property = await propertyRepo.findById({ tenantId }, id);
        if (!property) {
          return reply.status(404).send({
            success: false,
            error: "Imóvel não encontrado",
          });
        }

        return reply.status(200).send({
          success: true,
          property,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao obter imóvel");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao obter imóvel",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Cadastrar Imóvel Manualmente
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/properties",
    async (
      request: FastifyRequest<{
        Body: CreatePropertyInput;
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { title, transactionType, city, price } = request.body;
      if (!title || !transactionType || !city || price === undefined) {
        return reply.status(400).send({
          success: false,
          error: "title, transactionType, city e price são obrigatórios.",
        });
      }

      try {
        const property = await propertyRepo.create({ tenantId }, request.body);

        return reply.status(201).send({
          success: true,
          property,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao cadastrar imóvel");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao cadastrar imóvel",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Importação em Lote via CSV
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/properties/import-csv",
    async (
      request: FastifyRequest<{
        Body: { csvContent: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { csvContent } = request.body;
      if (!csvContent) {
        return reply.status(400).send({
          success: false,
          error: "Conteúdo do CSV é obrigatório.",
        });
      }

      try {
        const parsedProperties = csvImporter.parseCsv(csvContent);
        const result = await propertyRepo.bulkCreate({ tenantId }, parsedProperties);

        return reply.status(200).send({
          success: true,
          importedCount: result.inserted,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao importar CSV de imóveis");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao importar CSV",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Importação em Lote via VRSync (Etapa 15.2) — padrão XML oficial que toda
  // imobiliária já gera para ZAP/VivaReal/OLX.
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/properties/import-vrsync",
    async (
      request: FastifyRequest<{
        Body: { xmlContent: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = tenantContext(request);

      const { xmlContent } = request.body;
      if (!xmlContent) {
        return reply.status(400).send({
          success: false,
          error: "Conteúdo do XML é obrigatório.",
        });
      }

      // Parsear é um problema do ARQUIVO enviado (entrada do cliente), não do
      // servidor: separado do bulkCreate para poder responder 400 em vez de
      // 500 quando o XML está malformado ou não é VRSync.
      let parsed: ReturnType<VrSyncPropertyImporter["parseXml"]>;
      try {
        parsed = vrsyncImporter.parseXml(xmlContent);
      } catch (err: unknown) {
        return reply.status(400).send({
          success: false,
          error: err instanceof Error ? err.message : "XML inválido.",
        });
      }

      try {
        const result = await propertyRepo.bulkCreate({ tenantId }, parsed.properties);

        return reply.status(200).send({
          success: true,
          importedCount: result.inserted,
          // Diferente do import-csv: listings incompletos do feed de terceiro
          // são reportados, não só silenciosamente descartados — o corretor
          // não escreveu esse XML à mão para adivinhar por que faltou imóvel.
          skippedCount: parsed.skipped.length,
          skipped: parsed.skipped,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao importar catálogo VRSync");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao importar catálogo VRSync",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Atualizar Imóvel ou Alterar Status (Disponibilidade)
  // ----------------------------------------------------------------------------
  fastify.patch(
    "/api/properties/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          title?: string;
          price?: number;
          status?: PropertyStatus;
          condoFee?: number;
          bedrooms?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { tenantId } = tenantContext(request);

      try {
        const updated = await propertyRepo.update({ tenantId }, id, request.body);
        if (!updated) {
          return reply.status(404).send({
            success: false,
            error: "Imóvel não encontrado",
          });
        }

        return reply.status(200).send({
          success: true,
          property: updated,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao atualizar imóvel");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao atualizar imóvel",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Matchmaking: Buscar Imóveis Compatíveis para o Lead (DoD Determinístico)
  // ----------------------------------------------------------------------------
  fastify.get(
    "/api/leads/:id/matches",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { minScore?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: leadId } = request.params;
      const minScore = Number(request.query.minScore) || 50;
      const { tenantId } = tenantContext(request);

      try {
        const lead360 = await leadRepo.findLead360({ tenantId }, leadId);
        if (!lead360 || !lead360.profile) {
          return reply.status(404).send({
            success: false,
            error: "Lead ou perfil qualificado não encontrado.",
          });
        }

        // Buscar todos os imóveis disponíveis do tenant
        const allProperties = await propertyRepo.list({ tenantId }, { status: "AVAILABLE" });

        // Executar matching determinístico
        const matches = matcher.findMatchesForProfile(lead360.profile, allProperties, minScore);

        // Cada match volta com a procedência da disponibilidade (Etapa 15.1):
        // o corretor precisa ver QUANDO aquilo foi verificado antes de o
        // sistema prometer qualquer coisa ao lead. A janela é do tenant.
        const policy = await loadAvailabilityPolicy(tenantId);
        const matchesComProcedencia = matches.map((match) => ({
          ...match,
          availability: assessAvailability(
            {
              status: match.property.status,
              verifiedAt: match.property.availability_verified_at,
              source: match.property.availability_source,
            },
            policy,
          ),
        }));

        return reply.status(200).send({
          success: true,
          matches: matchesComProcedencia,
          totalMatches: matchesComProcedencia.length,
          needsReconfirmation: matchesComProcedencia.filter(
            (match) => match.availability.needsReconfirmation,
          ).length,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao executar matching de imóveis");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao executar matching",
        });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Gravar Sugestão de Imóvel para o Lead
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/leads/:id/matches/:propertyId/suggest",
    async (
      request: FastifyRequest<{
        Params: { id: string; propertyId: string };
        Body: { score?: number; reasons?: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: leadId, propertyId } = request.params;
      const { score = 80, reasons = ["Sugerido manualmente pelo corretor"] } = request.body || {};
      const { tenantId } = tenantContext(request);

      try {
        const matchRecord = await propertyRepo.saveMatch(
          { tenantId },
          leadId,
          propertyId,
          score,
          reasons,
        );

        await leadRepo.addActivity({ tenantId }, leadId, {
          activity_type: "NOTE",
          description: `Imóvel sugerido ao lead (Score: ${score}pts).`,
        });

        return reply.status(201).send({
          success: true,
          match: matchRecord,
        });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao gravar sugestão de imóvel");
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : "Erro ao gravar sugestão",
        });
      }
    },
  );
};
