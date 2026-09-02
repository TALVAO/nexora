import crypto from "node:crypto";

/**
 * Verificação de origem de webhook.
 *
 * Antes da Etapa 13.4 qualquer requisição para `/webhooks/...` era aceita: bastava
 * conhecer um UUID de tenant para injetar mensagem falsa, criar lead e acionar a
 * IA dentro da conta de outra imobiliária.
 */

export interface WebhookVerificationInput {
  /** Bytes exatos recebidos. Assinatura sobre o JSON reserializado não confere. */
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  /** Segredo da conexão do canal, quando houver um por tenant. */
  connectionSecret?: string | null;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

/** Comparação em tempo constante: `===` vaza o tamanho do prefixo correto. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function headerValue(
  headers: WebhookVerificationInput["headers"],
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw ?? undefined;
}

/**
 * Assinatura da Meta: `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 do corpo
 * cru com o App Secret. Vale para WhatsApp Cloud API e Instagram.
 */
export function verifyMetaSignature(input: WebhookVerificationInput): WebhookVerificationResult {
  const secret = input.connectionSecret || process.env.META_APP_SECRET;
  if (!secret) {
    return {
      valid: false,
      reason: "META_APP_SECRET não configurado: impossível verificar a origem do webhook.",
    };
  }

  const received = headerValue(input.headers, "x-hub-signature-256");
  if (!received) {
    return { valid: false, reason: "Cabeçalho x-hub-signature-256 ausente." };
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(input.rawBody).digest("hex");

  if (!safeCompare(received, expected)) {
    return { valid: false, reason: "Assinatura não confere." };
  }

  return { valid: true };
}

/**
 * Evolution API não assina os webhooks dela. A origem é provada por um token
 * compartilhado, definido por conexão de canal.
 *
 * É mais fraco que HMAC — não protege contra replay nem contra adulteração do
 * corpo — mas é o que o provider oferece. Uma razão a mais para o WhatsApp
 * oficial na venda (registrado em `memoria.md`).
 */
export function verifySharedToken(input: WebhookVerificationInput): WebhookVerificationResult {
  const secret = input.connectionSecret || process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!secret) {
    return {
      valid: false,
      reason: "Token de webhook não configurado para esta conexão de canal.",
    };
  }

  const received =
    headerValue(input.headers, "x-webhook-token") ?? headerValue(input.headers, "apikey");

  if (!received) {
    return { valid: false, reason: "Cabeçalho x-webhook-token ausente." };
  }

  if (!safeCompare(received, secret)) {
    return { valid: false, reason: "Token de webhook inválido." };
  }

  return { valid: true };
}
