import { query } from "../client.js";
import type { Channel } from "@nexora/shared";

export interface ResolvedChannelConnection {
  connectionId: string;
  tenantId: string;
  channel: Channel;
  provider: string;
  externalAccountId: string;
  status: string;
  /**
   * Segredo próprio desta conexão, quando configurado em
   * `settings_json.webhook_secret`. Sem ele, vale o segredo global do provider.
   */
  webhookSecret: string | null;
}

/**
 * Descobre a que tenant pertence uma conexão de canal.
 *
 * É o único caminho autorizado para o webhook saber de quem é a mensagem. Antes
 * da Etapa 13.4 o tenant vinha de `x-tenant-id` ou `?tenant_id`, sem prova
 * nenhuma: quem soubesse um UUID injetava mensagem na conta alheia.
 *
 * Roda FORA de sessão de tenant, como a resolução de vínculo do JWT — é a
 * consulta que descobre o tenant, então não pode depender de já saber qual é.
 */
export class ChannelConnectionRepository {
  async resolveByExternalAccount(
    channel: Channel,
    provider: string,
    externalAccountId: string,
  ): Promise<ResolvedChannelConnection | null> {
    if (!externalAccountId?.trim()) return null;

    const sql = `
      SELECT
        id,
        tenant_id,
        channel,
        provider,
        external_account_id,
        status,
        settings_json ->> 'webhook_secret' AS webhook_secret
      FROM channel_connections
      WHERE channel = $1::channel_type
        AND lower(provider) = lower($2)
        AND external_account_id = $3
      LIMIT 2;
    `;

    const result = await query<{
      id: string;
      tenant_id: string;
      channel: Channel;
      provider: string;
      external_account_id: string;
      status: string;
      webhook_secret: string | null;
    }>(sql, [channel, provider, externalAccountId.trim()]);

    // Duas conexões com a mesma conta externa em tenants diferentes seria
    // ambiguidade insolúvel: qualquer escolha entregaria a mensagem para
    // metade dos casos errados. Melhor recusar e alertar.
    if (result.rows.length > 1) {
      console.error(
        "[ChannelConnection] Conta externa registrada em mais de um tenant — webhook recusado:",
        { channel, provider, externalAccountId },
      );
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;

    return {
      connectionId: row.id,
      tenantId: row.tenant_id,
      channel: row.channel,
      provider: row.provider,
      externalAccountId: row.external_account_id,
      status: row.status,
      webhookSecret: row.webhook_secret,
    };
  }
}
