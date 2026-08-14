import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { MessageRow, MessageDirection, SenderType, MessageType } from "../types.js";

export interface CreateMessageInput {
  conversation_id: string;
  lead_id: string;
  external_message_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  message_type?: MessageType;
  text?: string | null;
  media_url?: string | null;
  provider_status?: string | null;
  ai_generated?: boolean;
  ai_run_id?: string | null;
}

export class MessageRepository {
  async create(
    ctx: TenantContext,
    input: CreateMessageInput,
  ): Promise<{ message: MessageRow; isDuplicate: boolean }> {
    assertTenantContext(ctx);

    const checkSql = `
      SELECT * FROM messages
      WHERE tenant_id = $1 AND external_message_id = $2
      LIMIT 1;
    `;
    const existing = await query<MessageRow>(checkSql, [ctx.tenantId, input.external_message_id]);
    if (existing.rows[0]) {
      return { message: existing.rows[0], isDuplicate: true };
    }

    const insertSql = `
      INSERT INTO messages (
        tenant_id,
        conversation_id,
        lead_id,
        external_message_id,
        direction,
        sender_type,
        message_type,
        text,
        media_url,
        provider_status,
        ai_generated,
        ai_run_id
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'TEXT'), $8, $9, $10, COALESCE($11, false), $12)
      ON CONFLICT (tenant_id, external_message_id) DO NOTHING
      RETURNING *;
    `;

    const params = [
      ctx.tenantId,
      input.conversation_id,
      input.lead_id,
      input.external_message_id,
      input.direction,
      input.sender_type,
      input.message_type ?? null,
      input.text ?? null,
      input.media_url ?? null,
      input.provider_status ?? null,
      input.ai_generated ?? null,
      input.ai_run_id ?? null,
    ];

    const result = await query<MessageRow>(insertSql, params);
    if (result.rows[0]) {
      return { message: result.rows[0], isDuplicate: false };
    }

    // In case of a race condition concurrent insert
    const fallback = await query<MessageRow>(checkSql, [ctx.tenantId, input.external_message_id]);
    if (fallback.rows[0]) {
      return { message: fallback.rows[0], isDuplicate: true };
    }

    throw new Error("Falha ao persistir mensagem.");
  }

  async findByExternalId(
    ctx: TenantContext,
    externalMessageId: string,
  ): Promise<MessageRow | null> {
    assertTenantContext(ctx);

    const sql = `
      SELECT * FROM messages
      WHERE tenant_id = $1 AND external_message_id = $2
      LIMIT 1;
    `;
    const result = await query<MessageRow>(sql, [ctx.tenantId, externalMessageId]);
    return result.rows[0] || null;
  }

  async listByConversation(
    ctx: TenantContext,
    conversationId: string,
    limit = 50,
  ): Promise<MessageRow[]> {
    assertTenantContext(ctx);

    const sql = `
      SELECT * FROM messages
      WHERE tenant_id = $1 AND conversation_id = $2
      ORDER BY sent_at ASC
      LIMIT $3;
    `;
    const result = await query<MessageRow>(sql, [ctx.tenantId, conversationId, limit]);
    return result.rows;
  }
}
