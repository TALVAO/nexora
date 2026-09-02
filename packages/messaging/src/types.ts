import type {
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "./security/webhook-signature.js";

import type { Channel } from "@nexora/shared";

export type MessageType =
  "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "LOCATION" | "REACTION" | "UNKNOWN";

export interface NormalizedMessage {
  tenantId: string;
  provider: string;
  channel: Channel;
  externalMessageId: string;
  externalConversationId?: string;
  externalUserId: string;
  direction: "INBOUND" | "OUTBOUND";
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  timestamp: string;
  rawPayloadReference?: string;
}

export interface SendTextInput {
  tenantId: string;
  to: string;
  text: string;
}

export interface SendTemplateInput {
  tenantId: string;
  to: string;
  templateName: string;
  parameters: Record<string, string>;
}

export interface SendMediaInput {
  tenantId: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  type: "image" | "audio" | "video" | "document";
}

export interface SendResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export interface DeliveryStatus {
  externalMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  timestamp: string;
  errorCode?: string;
}

export interface MessagingProvider {
  sendText(input: SendTextInput): Promise<SendResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  normalizeInbound(payload: unknown, defaultTenantId?: string): NormalizedMessage;
  getDeliveryStatus(payload: unknown): DeliveryStatus;

  /**
   * Identificador da conta do provider dentro do payload — nome da instância,
   * `phone_number_id`, id da conta do Instagram.
   *
   * É por ele que o tenant é descoberto em `channel_connections`. Fica no
   * adapter porque só ele conhece o formato bruto do provider (CLAUDE.md §15).
   */
  extractAccountId(payload: unknown): string | null;

  /** Prova que a requisição veio mesmo do provider, não de um terceiro. */
  verifyWebhookSignature(input: WebhookVerificationInput): WebhookVerificationResult;
}
