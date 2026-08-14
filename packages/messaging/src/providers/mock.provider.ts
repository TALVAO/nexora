import type {
  MessagingProvider,
  SendTextInput,
  SendTemplateInput,
  SendMediaInput,
  SendResult,
  DeliveryStatus,
  NormalizedMessage,
} from "../types.js";

export class MockMessagingProvider implements MessagingProvider {
  public sentTexts: SendTextInput[] = [];
  public sentTemplates: SendTemplateInput[] = [];
  public sentMedias: SendMediaInput[] = [];

  normalizeInbound(payload: unknown, defaultTenantId = "default"): NormalizedMessage {
    const raw = payload as Record<string, unknown>;
    return {
      tenantId: (raw.tenantId as string) || defaultTenantId,
      provider: (raw.provider as string) || "mock",
      channel: (raw.channel as "WHATSAPP" | "INSTAGRAM") || "WHATSAPP",
      externalMessageId: (raw.externalMessageId as string) || `mock_msg_${Date.now()}`,
      externalUserId: (raw.externalUserId as string) || "5511999990000",
      direction: (raw.direction as "INBOUND" | "OUTBOUND") || "INBOUND",
      type: (raw.type as "TEXT") || "TEXT",
      text: (raw.text as string) || "Olá, mensagem mock de teste",
      timestamp: (raw.timestamp as string) || new Date().toISOString(),
    };
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    this.sentTexts.push(input);
    return { success: true, externalMessageId: `mock_sent_${Date.now()}` };
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    this.sentTemplates.push(input);
    return { success: true, externalMessageId: `mock_tpl_${Date.now()}` };
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    this.sentMedias.push(input);
    return { success: true, externalMessageId: `mock_media_${Date.now()}` };
  }

  getDeliveryStatus(payload: unknown): DeliveryStatus {
    const raw = payload as Record<string, unknown>;
    return {
      externalMessageId: (raw.externalMessageId as string) || "mock_id",
      status: "DELIVERED",
      timestamp: new Date().toISOString(),
    };
  }
}
