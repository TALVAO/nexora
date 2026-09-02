import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { VocabularyRepository } from "@nexora/database";
import { uuidSchema } from "@nexora/validation";
import { tenantContext, ROLES_ADMIN } from "../plugins/auth.js";

export interface VocabularyPluginOptions {
  vocabularyRepo?: VocabularyRepository;
}

// ------------------------------------------------------------------------------
// Validação de fronteira (CLAUDE.md §39)
//
// Sem isto, `name: 123` estourava `name.trim is not a function` e o Fastify
// devolvia 500 com a mensagem interna no corpo; `?kind=` passava a guarda por
// ser falsy e quebrava no cast de enum do Postgres.
// ------------------------------------------------------------------------------

/** Query string vazia é ausência de filtro, não valor inválido. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const locationKindSchema = z.enum(["CITY", "NEIGHBORHOOD"]);
const vocabularyCategorySchema = z.enum(["PROPERTY_TYPE", "RENTAL_GUARANTEE"]);

const termSchema = z.string().trim().min(1).max(120);
const aliasesSchema = z.array(termSchema).max(50).optional();

const listLocationsQuerySchema = z.object({
  kind: z.preprocess(emptyToUndefined, locationKindSchema.optional()),
});

const createLocationSchema = z
  .object({
    kind: locationKindSchema,
    name: termSchema,
    parentCity: termSchema.optional(),
    aliases: aliasesSchema,
  })
  .refine((body) => body.kind !== "NEIGHBORHOOD" || Boolean(body.parentCity), {
    // Sem a cidade, "Centro" de duas cidades diferentes vira o mesmo registro.
    message: "parentCity é obrigatório ao cadastrar um bairro.",
    path: ["parentCity"],
  });

const locationIdSchema = z.object({ id: uuidSchema });

const listVocabularyQuerySchema = z.object({
  category: z.preprocess(emptyToUndefined, vocabularyCategorySchema.optional()),
});

const upsertVocabularySchema = z.object({
  category: vocabularyCategorySchema,
  canonicalValue: termSchema,
  aliases: aliasesSchema,
});

/** Primeira mensagem de erro, legível para quem chamou a API. */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Requisição inválida.";
  const campo = issue.path.join(".");
  return campo ? `${campo}: ${issue.message}` : issue.message;
}

/**
 * Geografia e vocabulário do tenant.
 *
 * Existe porque a Etapa 13.3 tirou a lista de bairros de dentro do código: sem
 * uma porta de entrada, um tenant novo ficaria sem geografia nenhuma e a IA
 * perguntaria "em qual bairro?" indefinidamente.
 */
export const vocabularyRoutes: FastifyPluginAsync<VocabularyPluginOptions> = async (
  fastify,
  opts,
) => {
  const vocabularyRepo = opts?.vocabularyRepo || new VocabularyRepository();

  // ----------------------------------------------------------------------------
  // Listar geografia do tenant
  // ----------------------------------------------------------------------------
  fastify.get("/api/tenant/locations", async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = tenantContext(request);

    const parsed = listLocationsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: firstIssue(parsed.error) });
    }

    try {
      const locations = await vocabularyRepo.listLocations(ctx, parsed.data.kind);
      return reply.status(200).send({ success: true, locations });
    } catch (err: unknown) {
      request.log.error(err, "Erro ao listar geografia do tenant");
      return reply.status(500).send({ success: false, error: "Erro ao listar geografia." });
    }
  });

  // ----------------------------------------------------------------------------
  // Cadastrar cidade ou bairro
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/tenant/locations",
    { config: { roles: ROLES_ADMIN } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = tenantContext(request);

      const parsed = createLocationSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: firstIssue(parsed.error) });
      }

      try {
        const location = await vocabularyRepo.registerLocation(ctx, {
          kind: parsed.data.kind,
          name: parsed.data.name,
          parentCity: parsed.data.parentCity ?? null,
          aliases: parsed.data.aliases ?? [],
          source: "MANUAL",
        });
        return reply.status(201).send({ success: true, location });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao cadastrar localização");
        return reply.status(500).send({ success: false, error: "Erro ao cadastrar localização." });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Desativar localização (mantém histórico)
  // ----------------------------------------------------------------------------
  fastify.delete(
    "/api/tenant/locations/:id",
    { config: { roles: ROLES_ADMIN } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = tenantContext(request);

      const parsed = locationIdSchema.safeParse(request.params ?? {});
      if (!parsed.success) {
        // Sem esta guarda, um id fora do formato UUID estourava no Postgres e
        // virava 500 em vez do 404 que a rota já sabe devolver.
        return reply.status(400).send({ success: false, error: firstIssue(parsed.error) });
      }

      try {
        const removed = await vocabularyRepo.deactivateLocation(ctx, parsed.data.id);
        if (!removed) {
          return reply.status(404).send({ success: false, error: "Localização não encontrada." });
        }
        return reply.status(200).send({ success: true });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao desativar localização");
        return reply.status(500).send({ success: false, error: "Erro ao desativar localização." });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Derivar geografia do catálogo já cadastrado
  // ----------------------------------------------------------------------------
  fastify.post(
    "/api/tenant/locations/backfill",
    { config: { roles: ROLES_ADMIN } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = tenantContext(request);

      try {
        const result = await vocabularyRepo.backfillFromProperties(ctx);
        return reply.status(200).send({ success: true, ...result });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao derivar geografia do catálogo");
        return reply.status(500).send({ success: false, error: "Erro ao derivar geografia." });
      }
    },
  );

  // ----------------------------------------------------------------------------
  // Vocabulário de negócio do tenant
  // ----------------------------------------------------------------------------
  fastify.get("/api/tenant/vocabulary", async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = tenantContext(request);

    const parsed = listVocabularyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: firstIssue(parsed.error) });
    }

    try {
      const terms = await vocabularyRepo.listVocabulary(ctx, parsed.data.category);
      return reply.status(200).send({ success: true, terms });
    } catch (err: unknown) {
      request.log.error(err, "Erro ao listar vocabulário do tenant");
      return reply.status(500).send({ success: false, error: "Erro ao listar vocabulário." });
    }
  });

  fastify.post(
    "/api/tenant/vocabulary",
    { config: { roles: ROLES_ADMIN } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = tenantContext(request);

      const parsed = upsertVocabularySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: firstIssue(parsed.error) });
      }

      try {
        await vocabularyRepo.upsertVocabularyTerm(ctx, {
          category: parsed.data.category,
          canonicalValue: parsed.data.canonicalValue,
          aliases: parsed.data.aliases ?? [],
        });
        return reply.status(201).send({ success: true });
      } catch (err: unknown) {
        request.log.error(err, "Erro ao cadastrar termo de vocabulário");
        return reply.status(500).send({ success: false, error: "Erro ao cadastrar termo." });
      }
    },
  );
};
