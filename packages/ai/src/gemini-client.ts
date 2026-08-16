import type { AIExecutionContext, GeneratedResponse } from "./types.js";

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
}

export class GeminiClient {
  private apiKey: string | null;
  private model: string;

  constructor(config?: GeminiConfig) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY || null;
    this.model = config?.model || "gemini-1.5-flash";
  }

  get isConfigured(): boolean {
    return (
      !!this.apiKey &&
      this.apiKey !== "sua-chave-gemini-aqui" &&
      !this.apiKey.startsWith("placeholder-")
    );
  }

  async generateResponse(context: AIExecutionContext): Promise<GeneratedResponse | null> {
    if (!this.isConfigured || !this.apiKey) {
      return null;
    }

    const systemInstruction = `
Você é o assistente inteligente da ${context.agencyName || "Imobiliária"}.
Sua missão: Atendimento inicial ágil, acolhedor e altamente objetivo para locação e venda de imóveis.
Diretrizes:
- Seja prestativo, profissional e conciso (mensagens curtas para WhatsApp).
- NUNCA invente imóveis, preços, taxas de condomínio ou condições que não foram fornecidas.
- Se o lead tiver dúvidas jurídicas, reclamações ou quiser fechar proposta, sugira educadamente transferir para o corretor humano.
- Se o lead estiver buscando imóvel, extraia: tipo de transação (alugar/comprar), tipo de imóvel, cidade, bairros, orçamento máximo, quartos e se tem pets.
- Responda SEMPRE em JSON no seguinte formato estrito:
{
  "intent": "RENTAL_SEARCH" | "BUY_SEARCH" | "VISIT_REQUEST" | "GENERAL_QUESTION" | "SCHEDULE_RESCHEDULE" | "OPT_OUT" | "UNKNOWN",
  "confidence": number (0 a 100),
  "responseText": "texto amigável para enviar no WhatsApp",
  "shouldHandoff": boolean,
  "handoffReason": string ou null,
  "extractedProfile": {
    "transactionType": "RENT" | "BUY" | null,
    "propertyType": string ou null,
    "city": string ou null,
    "neighborhoods": string[],
    "maxBudget": number ou null,
    "bedrooms": number ou null,
    "hasPet": boolean ou null
  }
}
    `.trim();

    const userPrompt = `
Perfil Atual do Lead:
${JSON.stringify(context.currentProfile || {}, null, 2)}

Última Mensagem do Lead:
"${context.lastMessageText}"
    `.trim();

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText) as {
        intent: string;
        confidence: number;
        responseText: string;
        shouldHandoff: boolean;
        handoffReason?: string | null;
        extractedProfile: {
          transactionType?: "RENT" | "BUY" | null;
          propertyType?: string | null;
          city?: string | null;
          neighborhoods?: string[];
          maxBudget?: number | null;
          bedrooms?: number | null;
          hasPet?: boolean | null;
        };
      };

      return {
        text: parsed.responseText,
        shouldHandoff: !!parsed.shouldHandoff,
        handoffReason: parsed.handoffReason || undefined,
        confidence: parsed.confidence || 90,
        intent: (parsed.intent as any) || "RENTAL_SEARCH",
        extractedProfile: {
          ...context.currentProfile,
          transactionType:
            parsed.extractedProfile?.transactionType ?? context.currentProfile?.transactionType,
          propertyType:
            parsed.extractedProfile?.propertyType ?? context.currentProfile?.propertyType,
          city: parsed.extractedProfile?.city ?? context.currentProfile?.city,
          neighborhoods: parsed.extractedProfile?.neighborhoods?.length
            ? parsed.extractedProfile.neighborhoods
            : context.currentProfile?.neighborhoods || [],
          maxBudget: parsed.extractedProfile?.maxBudget ?? context.currentProfile?.maxBudget,
          bedrooms: parsed.extractedProfile?.bedrooms ?? context.currentProfile?.bedrooms,
          hasPet: parsed.extractedProfile?.hasPet ?? context.currentProfile?.hasPet,
        },
        nextAction: {
          action: parsed.shouldHandoff ? "HANDOFF_HUMAN" : "ASK_QUESTION",
          handoffReason: parsed.handoffReason || undefined,
          reason: parsed.shouldHandoff
            ? "Decisão de intervenção humana pelo modelo LLM"
            : "Coleta de informações e atendimento pelo modelo LLM",
          confidence: parsed.confidence || 90,
        },
      };
    } catch {
      // Fallback gracioso para o motor determinístico
      return null;
    }
  }
}
