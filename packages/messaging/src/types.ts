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
  normalizeInbound(payload: unknown): NormalizedMessage;
  getDeliveryStatus(payload: unknown): DeliveryStatus;
}
