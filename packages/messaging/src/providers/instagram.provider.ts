import type {
  MessagingProvider,
  SendTextInput,
  SendTemplateInput,
  SendMediaInput,
  SendResult,
  DeliveryStatus,
  NormalizedMessage,
  MessageType,
} from "../types.js";

export interface InstagramWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{
          type?: string;
          payload?: { url?: string };
        }>;
      };
    }>;
  }>;
}

export class InstagramMessagingProvider implements MessagingProvider {
  constructor(private readonly verifyToken?: string) {}

  verifyWebhookToken(token?: string): boolean {
    if (!this.verifyToken) return true;
    return token === this.verifyToken;
  }

  normalizeInbound(payload: unknown, defaultTenantId = "default"): NormalizedMessage {
    const raw = payload as InstagramWebhookPayload;
    const msgObj = raw?.entry?.[0]?.messaging?.[0];
    const msg = msgObj?.message;

    const externalMessageId =
      msg?.mid || `ig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const externalUserId = msgObj?.sender?.id || "unknown";

    let messageType: MessageType = "TEXT";
    const text = msg?.text;
    let mediaUrl: string | undefined;

    if (msg?.attachments && msg.attachments.length > 0) {
      const firstAttachment = msg.attachments[0];
      mediaUrl = firstAttachment?.payload?.url;
      const attType = firstAttachment?.type?.toLowerCase();

      if (attType === "image") messageType = "IMAGE";
      else if (attType === "audio") messageType = "AUDIO";
      else if (attType === "video") messageType = "VIDEO";
      else messageType = "DOCUMENT";
    }

    const timestamp = msgObj?.timestamp
      ? new Date(msgObj.timestamp).toISOString()
      : new Date().toISOString();

    return {
      tenantId: defaultTenantId,
      provider: "instagram_graph",
      channel: "INSTAGRAM",
      externalMessageId,
      externalConversationId: externalUserId,
      externalUserId,
      direction: "INBOUND",
      type: messageType,
      text: text || undefined,
      mediaUrl: mediaUrl || undefined,
      timestamp,
      rawPayloadReference: raw?.object,
    };
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `ig_out_${Date.now()}`,
    };
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `ig_tpl_${Date.now()}`,
    };
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `ig_med_${Date.now()}`,
    };
  }

  getDeliveryStatus(_payload: unknown): DeliveryStatus {
    return {
      externalMessageId: "ig_status",
      status: "DELIVERED",
      timestamp: new Date().toISOString(),
    };
  }
}
