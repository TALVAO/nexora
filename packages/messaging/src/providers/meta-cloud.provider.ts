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

export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
          image?: {
            id?: string;
            caption?: string;
            mime_type?: string;
          };
          audio?: {
            id?: string;
            mime_type?: string;
          };
          video?: {
            id?: string;
            caption?: string;
          };
          document?: {
            id?: string;
            filename?: string;
          };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
        }>;
      };
      field?: string;
    }>;
  }>;
}

export class MetaWhatsAppCloudProvider implements MessagingProvider {
  constructor(private readonly verifyToken?: string) {}

  verifyWebhookToken(token?: string): boolean {
    if (!this.verifyToken) return true;
    return token === this.verifyToken;
  }

  normalizeInbound(payload: unknown, defaultTenantId = "default"): NormalizedMessage {
    const raw = payload as MetaWebhookPayload;
    const change = raw?.entry?.[0]?.changes?.[0]?.value;
    const msg = change?.messages?.[0];

    const externalMessageId =
      msg?.id || `meta_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const externalUserId = msg?.from || "unknown";

    let messageType: MessageType = "TEXT";
    let text: string | undefined;

    if (msg?.type === "text") {
      messageType = "TEXT";
      text = msg.text?.body;
    } else if (msg?.type === "image") {
      messageType = "IMAGE";
      text = msg.image?.caption;
    } else if (msg?.type === "audio") {
      messageType = "AUDIO";
    } else if (msg?.type === "video") {
      messageType = "VIDEO";
      text = msg.video?.caption;
    } else if (msg?.type === "document") {
      messageType = "DOCUMENT";
      text = msg.document?.filename;
    } else {
      messageType = "UNKNOWN";
    }

    const timestamp = msg?.timestamp
      ? new Date(Number(msg.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    return {
      tenantId: defaultTenantId,
      provider: "meta_cloud",
      channel: "WHATSAPP",
      externalMessageId,
      externalConversationId: externalUserId,
      externalUserId,
      direction: "INBOUND",
      type: messageType,
      text: text || undefined,
      timestamp,
      rawPayloadReference: raw?.object,
    };
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `meta_out_${Date.now()}`,
    };
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `meta_tpl_${Date.now()}`,
    };
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `meta_med_${Date.now()}`,
    };
  }

  getDeliveryStatus(payload: unknown): DeliveryStatus {
    const raw = payload as MetaWebhookPayload;
    const statusObj = raw?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    return {
      externalMessageId: statusObj?.id || "unknown",
      status: (statusObj?.status?.toUpperCase() as DeliveryStatus["status"]) || "DELIVERED",
      timestamp: new Date().toISOString(),
    };
  }
}
