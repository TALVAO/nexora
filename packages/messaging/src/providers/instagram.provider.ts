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
import {
  verifyMetaSignature,
  type WebhookVerificationInput,
  type WebhookVerificationResult,
} from "../security/webhook-signature.js";

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
        reply_to?: { mid?: string; story?: { url?: string; id?: string } };
        attachments?: Array<{
          type?: string;
          payload?: { url?: string };
        }>;
      };
      referral?: {
        source?: string;
        type?: string;
        ad_id?: string;
      };
      delivery?: {
        mids?: string[];
        watermark?: number;
      };
      read?: {
        watermark?: number;
      };
    }>;
  }>;
}

export interface InstagramProviderConfig {
  verifyToken?: string;
  accessToken?: string;
  apiVersion?: string;
}

export class InstagramMessagingProvider implements MessagingProvider {
  private readonly verifyToken?: string;
  private readonly accessToken?: string;
  private readonly apiVersion: string;

  constructor(config?: InstagramProviderConfig | string) {
    if (typeof config === "string") {
      this.verifyToken = config;
      this.apiVersion = "v19.0";
    } else {
      this.verifyToken = config?.verifyToken;
      this.accessToken = config?.accessToken;
      this.apiVersion = config?.apiVersion || "v19.0";
    }
  }

  verifyWebhookToken(token?: string): boolean {
    if (!this.verifyToken) return true;
    return token === this.verifyToken;
  }

  normalizeInbound(payload: unknown, defaultTenantId = "default"): NormalizedMessage {
    const raw = payload as InstagramWebhookPayload;
    const entry = raw?.entry?.[0];
    const msgObj = entry?.messaging?.[0];
    const msg = msgObj?.message;

    const externalMessageId =
      msg?.mid || `ig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const externalUserId = msgObj?.sender?.id || "unknown";

    let messageType: MessageType = "TEXT";
    let text = msg?.text;
    let mediaUrl: string | undefined;

    // Verificar se é resposta a Stories ou Menção
    if (msg?.reply_to?.story?.url) {
      mediaUrl = msg.reply_to.story.url;
      text = text ? `[Resposta ao Story] ${text}` : "[Resposta ao Story]";
    }

    if (msg?.attachments && msg.attachments.length > 0) {
      const firstAttachment = msg.attachments[0];
      mediaUrl = firstAttachment?.payload?.url || mediaUrl;
      const attType = firstAttachment?.type?.toLowerCase();

      if (attType === "image" || attType === "story_mention") messageType = "IMAGE";
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

  async sendText(input: SendTextInput): Promise<SendResult> {
    if (!this.accessToken) {
      // Modo simulação para testes
      return {
        success: true,
        externalMessageId: `ig_out_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/me/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: input.to },
          message: { text: input.text },
        }),
      });

      const data = (await response.json()) as { message_id?: string; error?: { message: string } };

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || `Erro HTTP ${response.status} ao enviar no Instagram.`,
        };
      }

      return {
        success: true,
        externalMessageId: data.message_id || `ig_out_${Date.now()}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Erro inesperado ao enviar mensagem no Instagram.",
      };
    }
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    return this.sendText({
      tenantId: input.tenantId,
      to: input.to,
      text: `[Template ${input.templateName}]`,
    });
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (!this.accessToken) {
      return {
        success: true,
        externalMessageId: `ig_media_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/me/messages`;
      const mediaType =
        input.type === "image"
          ? "image"
          : input.type === "video"
            ? "video"
            : input.type === "audio"
              ? "audio"
              : "file";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: input.to },
          message: {
            attachment: {
              type: mediaType,
              payload: {
                url: input.mediaUrl,
                is_reusable: true,
              },
            },
          },
        }),
      });

      const data = (await response.json()) as { message_id?: string; error?: { message: string } };

      if (!response.ok || data.error) {
        return {
          success: false,
          error:
            data.error?.message || `Erro HTTP ${response.status} ao enviar mídia no Instagram.`,
        };
      }

      return {
        success: true,
        externalMessageId: data.message_id || `ig_media_${Date.now()}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erro ao enviar mídia no Instagram.",
      };
    }
  }

  getDeliveryStatus(payload: unknown): DeliveryStatus {
    const raw = payload as InstagramWebhookPayload;
    const msgObj = raw?.entry?.[0]?.messaging?.[0];

    if (msgObj?.read) {
      return {
        externalMessageId: "all_read",
        status: "READ",
        timestamp: new Date().toISOString(),
      };
    }

    if (msgObj?.delivery) {
      const mid = msgObj.delivery.mids?.[0] || "unknown";
      return {
        externalMessageId: mid,
        status: "DELIVERED",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      externalMessageId: "unknown",
      status: "SENT",
      timestamp: new Date().toISOString(),
    };
  }

  /** `entry[0].id` é a conta do Instagram que recebeu a mensagem. */
  extractAccountId(payload: unknown): string | null {
    const raw = payload as InstagramWebhookPayload;
    return raw?.entry?.[0]?.id?.trim() || null;
  }

  verifyWebhookSignature(input: WebhookVerificationInput): WebhookVerificationResult {
    return verifyMetaSignature(input);
  }
}
