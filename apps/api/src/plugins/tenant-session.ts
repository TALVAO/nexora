import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import { withTenantTransaction } from "@nexora/database";
import { tenantContext, DEFAULT_ACCESS, type RouteAccess } from "./auth.js";

export interface TenantSessionOptions {
  /**
   * Desligado por padrão sob NODE_ENV=test, onde os repositórios são
   * substituídos por dublês e não existe banco para transacionar.
   * O RLS de verdade é exercido pelo teste de integração dedicado.
   */
  enabled?: boolean;
}

/**
 * Faz cada rota de tenant rodar dentro de uma transação com
 * `app.current_tenant_id` fixado e privilégio rebaixado para a role de
 * aplicação.
 *
 * A partir daqui o isolamento não depende mais de o SQL lembrar do
 * `WHERE tenant_id`: o banco recusa linha de outro tenant de qualquer forma.
 *
 * Envolver o handler via `onRoute` (em vez de manipular BEGIN/COMMIT em hooks
 * de ciclo de vida) preserva o `try/finally` de `withTenantTransaction` — que é
 * o que garante a devolução da conexão ao pool mesmo em erro.
 *
 * LIMITAÇÃO CONHECIDA: os handlers chamam `reply.send()` dentro da transação,
 * então a resposta sai antes do COMMIT. Se o COMMIT falhar (perda de conexão),
 * o cliente terá recebido 200 para uma transação revertida. Raro, registrado em
 * log, e a corrigir se aparecer no piloto.
 */
export function registerTenantSession(app: FastifyInstance, options?: TenantSessionOptions): void {
  const enabled = options?.enabled ?? process.env.NODE_ENV !== "test";

  if (!enabled) {
    app.log.warn(
      "Sessão de tenant no banco DESATIVADA: o RLS não será exercido nesta instância. Esperado apenas em testes.",
    );
    return;
  }

  app.addHook("onRoute", (routeOptions) => {
    const access: RouteAccess = routeOptions.config?.access ?? DEFAULT_ACCESS;
    if (access !== "tenant") return;

    const original = routeOptions.handler as RouteHandlerMethod | undefined;
    if (!original) return;

    const wrapped: RouteHandlerMethod = function (request, reply) {
      return withTenantTransaction(tenantContext(request), async () =>
        original.call(this, request, reply),
      );
    };

    routeOptions.handler = wrapped;
  });
}
