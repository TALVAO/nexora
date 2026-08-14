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

export interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      imageMessage?: {
        caption?: string;
        url?: string;
      };
      audioMessage?: {
        url?: string;
      };
      videoMessage?: {
        caption?: string;
        url?: string;
      };
      documentMessage?: {
        title?: string;
        url?: string;
      };
    };
    messageType?: string;
    messageTimestamp?: number | string;
    status?: string;
  };
}

export class EvolutionWhatsAppProvider implements MessagingProvider {
  constructor(private readonly apiKey?: string) {}

  validateWebhook(tokenOrKey?: string): boolean {
    if (!this.apiKey) return true;
    return tokenOrKey === this.apiKey;
  }

  normalizeInbound(payload: unknown, defaultTenantId = "default"): NormalizedMessage {
    const raw = payload as EvolutionWebhookPayload;
    const data = raw?.data;
    const key = data?.key;

    const externalMessageId =
      key?.id || `evo_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const remoteJid = key?.remoteJid || "";
    const externalUserId = remoteJid.split("@")[0] || "unknown";

    let messageType: MessageType = "TEXT";
    let text: string | undefined;
    let mediaUrl: string | undefined;

    const msg = data?.message;
    if (msg) {
      if (msg.conversation) {
        text = msg.conversation;
        messageType = "TEXT";
      } else if (msg.extendedTextMessage?.text) {
        text = msg.extendedTextMessage.text;
        messageType = "TEXT";
      } else if (msg.imageMessage) {
        text = msg.imageMessage.caption;
        mediaUrl = msg.imageMessage.url;
        messageType = "IMAGE";
      } else if (msg.audioMessage) {
        mediaUrl = msg.audioMessage.url;
        messageType = "AUDIO";
      } else if (msg.videoMessage) {
        text = msg.videoMessage.caption;
        mediaUrl = msg.videoMessage.url;
        messageType = "VIDEO";
      } else if (msg.documentMessage) {
        text = msg.documentMessage.title;
        mediaUrl = msg.documentMessage.url;
        messageType = "DOCUMENT";
      } else {
        messageType = "UNKNOWN";
      }
    }

    const timestamp = data?.messageTimestamp
      ? new Date(
          typeof data.messageTimestamp === "number"
            ? data.messageTimestamp * 1000
            : data.messageTimestamp,
        ).toISOString()
      : new Date().toISOString();

    return {
      tenantId: defaultTenantId,
      provider: "evolution",
      channel: "WHATSAPP",
      externalMessageId,
      externalConversationId: remoteJid,
      externalUserId,
      direction: key?.fromMe ? "OUTBOUND" : "INBOUND",
      type: messageType,
      text: text || undefined,
      mediaUrl: mediaUrl || undefined,
      timestamp,
      rawPayloadReference: raw?.event,
    };
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `evo_out_${Date.now()}`,
    };
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `evo_tpl_${Date.now()}`,
    };
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    return {
      success: true,
      externalMessageId: `evo_med_${Date.now()}`,
    };
  }

  getDeliveryStatus(payload: unknown): DeliveryStatus {
    const raw = payload as EvolutionWebhookPayload;
    return {
      externalMessageId: raw?.data?.key?.id || "unknown",
      status: (raw?.data?.status as DeliveryStatus["status"]) || "DELIVERED",
      timestamp: new Date().toISOString(),
    };
  }
}
