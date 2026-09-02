import type { FastifyInstance, FastifyRequest } from "fastify";
import { DEFAULT_ACCESS, type RouteAccess } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Bytes exatos do corpo, preservados apenas em rotas de webhook.
     *
     * A assinatura HMAC é calculada sobre o que o provider enviou. Reserializar
     * o JSON muda espaços e ordem de chaves e faz a assinatura nunca conferir.
     */
    rawBody?: Buffer;
  }
}

/**
 * Substitui o parser de JSON para guardar o corpo cru nas rotas de webhook.
 *
 * Guardar em toda requisição custaria memória à toa; a verificação de origem só
 * existe no caminho do webhook.
 */
export function registerRawBody(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request: FastifyRequest, body: Buffer | string, done) => {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const access: RouteAccess = request.routeOptions?.config?.access ?? DEFAULT_ACCESS;

      if (access === "webhook") {
        request.rawBody = buffer;
      }

      if (buffer.length === 0) {
        done(null, undefined);
        return;
      }

      try {
        done(null, JSON.parse(buffer.toString("utf8")));
      } catch (err) {
        const parseError = err as Error & { statusCode?: number };
        parseError.statusCode = 400;
        done(parseError, undefined);
      }
    },
  );
}
