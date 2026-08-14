import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { PropertyRepository, LeadRepository, type CreatePropertyInput } from "@nexora/database";
import { PropertyMatcher, CsvPropertyImporter } from "@nexora/messaging";
import type { PropertyStatus } from "@nexora/shared";

export interface PropertyPluginOptions {
  propertyRepo?: PropertyRepository;
  leadRepo?: LeadRepository;
  matcher?: PropertyMatcher;
  csvImporter?: CsvPropertyImporter;
}

export const propertyRoutes: FastifyPluginAsync<PropertyPluginOptions> = async (fastify, opts) => {
  const propertyRepo = opts?.propertyRepo || new PropertyRepository();
  const leadRepo = opts?.leadRepo || new LeadRepository();
  const matcher = opts?.matcher || new PropertyMatcher();
  const csvImporter = opts?.csvImporter || new CsvPropertyImporter();

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: leadId } = request.params;
      const minScore = Number(request.query.minScore) || 50;
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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

        return reply.status(200).send({
          success: true,
          matches,
          totalMatches: matches.length,
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
        Headers: { "x-tenant-id"?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: leadId, propertyId } = request.params;
      const { score = 80, reasons = ["Sugerido manualmente pelo corretor"] } = request.body || {};
      const tenantId =
        request.headers["x-tenant-id"] ||
        process.env.DEFAULT_TENANT_ID ||
        "a0000000-0000-0000-0000-000000000001";

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
