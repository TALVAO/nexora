import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { TenantRepository, type TenantContext } from "@nexora/database";
import type { Role } from "@nexora/shared";

/**
 * Níveis de acesso declarados por rota via `config: { access: ... }`.
 *
 * O padrão é `tenant` (o mais restritivo utilizável): uma rota que esquecer de
 * declarar o nível continua exigindo JWT válido + vínculo ativo com o tenant.
 * Fail closed é intencional — CLAUDE.md §34/§39.
 */
export type RouteAccess = "public" | "authenticated" | "tenant" | "webhook";

export const DEFAULT_ACCESS: RouteAccess = "tenant";

/** Métodos que não alteram estado. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Operações que mexem em plano, cobrança ou identidade da conta. */
export const ROLES_OWNER_ONLY: Role[] = ["OWNER"];

/** Operações de administração da equipe e da operação. */
export const ROLES_ADMIN: Role[] = ["OWNER", "MANAGER"];

declare module "fastify" {
  interface FastifyContextConfig {
    access?: RouteAccess;
    /**
     * Papéis autorizados nesta rota. Quando ausente, vale apenas a regra
     * geral: VIEWER não escreve.
     */
    roles?: Role[];
  }

  interface FastifyRequest {
    auth: AuthContext;
  }
}

export interface AuthContext {
  /** `sub` do JWT do Supabase Auth. */
  userId: string | null;
  email: string | null;
  /** `profiles.id` correspondente ao usuário autenticado. */
  profileId: string | null;
  /** Resolvido via `tenant_members`. NUNCA vem do cliente. */
  tenantId: string | null;
  role: Role | null;
}

export const ANONYMOUS: AuthContext = {
  userId: null,
  email: null,
  profileId: null,
  tenantId: null,
  role: null,
};

/**
 * Payload relevante do token do Supabase Auth.
 * Supabase assina em HS256 com o JWT secret do projeto.
 */
interface SupabaseJwtPayload {
  sub?: string;
  email?: string;
  aud?: string | string[];
  exp?: number;
}

export class TenantResolutionError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "TenantResolutionError";
  }
}

/**
 * Converte o contexto autenticado no `TenantContext` que os repositórios
 * esperam. Use em toda rota de nível `tenant`.
 *
 * Lança se chamado numa rota que não exige tenant — isso é bug de programação,
 * não erro de runtime do usuário.
 */
export function tenantContext(request: FastifyRequest): TenantContext {
  const { tenantId, userId, role } = request.auth ?? ANONYMOUS;
  if (!tenantId) {
    throw new TenantResolutionError(
      500,
      "tenantContext() chamado em rota sem access 'tenant'. Verifique a config da rota.",
    );
  }
  return {
    tenantId,
    userId: userId ?? undefined,
    role: role ?? undefined,
  };
}

function resolveJwtSecret(app: FastifyInstance): string {
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (secret && secret.length >= 32 && !secret.startsWith("placeholder")) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SUPABASE_JWT_SECRET ausente ou inválido. A API não sobe em produção sem segredo de JWT real (CLAUDE.md §35).",
    );
  }

  app.log.warn(
    "SUPABASE_JWT_SECRET ausente ou placeholder. Usando segredo de DESENVOLVIMENTO. Nunca use isto fora do ambiente local.",
  );
  return "nexora-development-only-jwt-secret-do-not-use-in-production";
}

export interface AuthPluginOptions {
  tenantRepo?: TenantRepository;
}

/**
 * Registra autenticação JWT + resolução de tenant como hook global.
 *
 * Chamado diretamente sobre a instância raiz (não via `register`) para que o
 * hook valha para TODAS as rotas registradas depois, sem encapsulamento.
 */
export async function registerAuth(
  app: FastifyInstance,
  options?: AuthPluginOptions,
): Promise<void> {
  const tenantRepo = options?.tenantRepo || new TenantRepository();

  await app.register(fastifyJwt, {
    secret: resolveJwtSecret(app),
    verify: {
      // Trava o algoritmo. Sem isto, um token forjado com `alg: none` ou com
      // troca RS256->HS256 poderia ser aceito.
      algorithms: ["HS256"],
      allowedAud: process.env.SUPABASE_JWT_AUD || "authenticated",
    },
  });

  // Fastify v5 tipa o valor padrão como getter/setter; `auth` é sempre
  // sobrescrito no preHandler abaixo antes de qualquer handler rodar.
  app.decorateRequest("auth", null as unknown as AuthContext);

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const access: RouteAccess = request.routeOptions?.config?.access ?? DEFAULT_ACCESS;

    request.auth = { ...ANONYMOUS };

    if (access === "public") {
      return;
    }

    // Webhooks não carregam JWT: a origem é validada por assinatura do provider
    // e o tenant sai de `channel_connections`. Ver Etapa 13.4.
    if (access === "webhook") {
      return;
    }

    let payload: SupabaseJwtPayload;
    try {
      payload = await request.jwtVerify<SupabaseJwtPayload>();
    } catch (err) {
      request.log.warn({ err: (err as Error).message }, "JWT inválido ou ausente");
      return reply.status(401).send({
        success: false,
        error: "Autenticação obrigatória.",
      });
    }

    const userId = payload.sub;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: "Token sem identificação de usuário.",
      });
    }

    request.auth = {
      ...ANONYMOUS,
      userId,
      email: payload.email ?? null,
    };

    if (access === "authenticated") {
      return;
    }

    // `x-tenant-id` sobrevive APENAS como seletor para usuários com vínculo em
    // mais de um tenant. O valor é sempre verificado contra tenant_members;
    // ele nunca estabelece identidade por si só.
    const requestedTenantId = request.headers["x-tenant-id"];
    const selector = typeof requestedTenantId === "string" ? requestedTenantId.trim() : null;

    let membership;
    try {
      membership = await tenantRepo.resolveMembership(userId, selector || null);
    } catch (err) {
      request.log.error(err, "Falha ao resolver vínculo do usuário com o tenant");
      return reply.status(500).send({
        success: false,
        error: "Falha ao resolver o tenant da requisição.",
      });
    }

    if (!membership) {
      request.log.warn(
        { userId, selector },
        "Acesso negado: usuário sem vínculo ativo com o tenant solicitado",
      );
      return reply.status(403).send({
        success: false,
        error: "Usuário sem vínculo ativo com este tenant.",
      });
    }

    request.auth = {
      userId,
      email: payload.email ?? null,
      profileId: membership.profileId,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    // ---- Autorização por papel (CLAUDE.md §12) ----

    // Regra geral: VIEWER observa, não altera. Vale para toda rota de tenant,
    // sem precisar anotar uma a uma — anotação esquecida vira brecha.
    if (membership.role === "VIEWER" && !READ_ONLY_METHODS.has(request.method)) {
      request.log.warn(
        { userId, tenantId: membership.tenantId, method: request.method, url: request.url },
        "Acesso negado: VIEWER tentou operação de escrita",
      );
      return reply.status(403).send({
        success: false,
        error: "Seu perfil é somente leitura nesta conta.",
      });
    }

    // Restrição explícita da rota, quando houver.
    const allowedRoles = request.routeOptions?.config?.roles;
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      request.log.warn(
        { userId, tenantId: membership.tenantId, role: membership.role, url: request.url },
        "Acesso negado: papel insuficiente para a rota",
      );
      return reply.status(403).send({
        success: false,
        error: "Seu perfil não tem permissão para esta operação.",
      });
    }
  });
}
