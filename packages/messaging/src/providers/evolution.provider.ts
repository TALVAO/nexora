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

export interface EvolutionConfig {
  apiUrl?: string;
  apiKey?: string;
  instanceName?: string;
  fetchFn?: typeof fetch;
}

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
  private apiUrl: string;
  private apiKey: string;
  private instanceName: string;
  private fetchFn: typeof fetch;

  constructor(config?: EvolutionConfig | string) {
    if (typeof config === "string") {
      this.apiKey = config;
      this.apiUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";
      this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || "nexora_test";
      this.fetchFn = globalThis.fetch;
    } else {
      this.apiKey = config?.apiKey || process.env.EVOLUTION_API_KEY || "";
      this.apiUrl = config?.apiUrl || process.env.EVOLUTION_API_URL || "http://localhost:8080";
      this.instanceName =
        config?.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "nexora_test";
      this.fetchFn = config?.fetchFn || globalThis.fetch;
    }
  }

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

  async sendText(input: SendTextInput): Promise<SendResult> {
    if (!this.apiUrl || !this.apiKey) {
      return {
        success: true,
        externalMessageId: `evo_mock_out_${Date.now()}`,
      };
    }

    try {
      const url = `${this.apiUrl}/message/sendText/${this.instanceName}`;
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify({
          number: input.to,
          text: input.text,
          options: {
            delay: 1000,
            presence: "composing",
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return {
          success: false,
          error: `Evolution API returned ${response.status}: ${errBody}`,
        };
      }

      const data = (await response.json()) as { key?: { id?: string } };
      return {
        success: true,
        externalMessageId: data?.key?.id || `evo_sent_${Date.now()}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Erro desconhecido ao enviar mensagem via Evolution",
      };
    }
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    // Template fallback to text message for Evolution API
    return this.sendText({
      tenantId: input.tenantId,
      to: input.to,
      text: `[${input.templateName}] ${JSON.stringify(input.parameters)}`,
    });
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (!this.apiUrl || !this.apiKey) {
      return {
        success: true,
        externalMessageId: `evo_mock_media_${Date.now()}`,
      };
    }

    try {
      const url = `${this.apiUrl}/message/sendMedia/${this.instanceName}`;
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify({
          number: input.to,
          media: input.mediaUrl,
          mediatype: input.type,
          caption: input.caption || "",
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return {
          success: false,
          error: `Evolution API returned ${response.status}: ${errBody}`,
        };
      }

      const data = (await response.json()) as { key?: { id?: string } };
      return {
        success: true,
        externalMessageId: data?.key?.id || `evo_media_${Date.now()}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erro ao enviar mídia via Evolution",
      };
    }
  }

  async getConnectionStatus(): Promise<{ connected: boolean; state: string }> {
    if (!this.apiUrl || !this.apiKey) {
      return { connected: true, state: "open" };
    }

    try {
      const url = `${this.apiUrl}/instance/connectionState/${this.instanceName}`;
      const res = await this.fetchFn(url, {
        headers: { apikey: this.apiKey },
      });

      if (!res.ok) {
        return { connected: false, state: "disconnected" };
      }

      const data = (await res.json()) as { instance?: { state?: string } };
      const state = data?.instance?.state || "unknown";
      return {
        connected: state === "open",
        state,
      };
    } catch {
      return { connected: false, state: "error" };
    }
  }

  getDeliveryStatus(payload: unknown): DeliveryStatus {
    const raw = payload as EvolutionWebhookPayload;
    const rawStatus = (raw?.data?.status || "DELIVERED").toUpperCase();

    let status: DeliveryStatus["status"] = "DELIVERED";
    if (rawStatus === "PENDING" || rawStatus === "SERVER_ACK") {
      status = "SENT";
    } else if (rawStatus === "DELIVERY_ACK" || rawStatus === "DELIVERED") {
      status = "DELIVERED";
    } else if (rawStatus === "READ" || rawStatus === "PLAYED") {
      status = "READ";
    } else if (rawStatus === "ERROR" || rawStatus === "FAILED") {
      status = "FAILED";
    }

    return {
      externalMessageId: raw?.data?.key?.id || "unknown",
      status,
      timestamp: new Date().toISOString(),
    };
  }
}
