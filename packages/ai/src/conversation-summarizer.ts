import type { ExtractedLeadProfile } from "./types.js";
import type { GeminiClient } from "./gemini-client.js";

export interface ConversationSummaryInput {
  leadName: string | null;
  agencyName?: string;
  profile?: ExtractedLeadProfile;
  history: Array<{
    role: "lead" | "assistant" | "system";
    text: string;
  }>;
}

export interface ConversationSummaryResult {
  text: string;
  /** Só para log/observabilidade — quem chama não decide nada com base nisso. */
  source: "AI" | "FALLBACK";
}

const HISTORY_LIMIT = 20;
const SUMMARY_LINES = 3;

/**
 * Resumo de 3 linhas ao assumir uma conversa. Quando a IA está disponível,
 * pede um resumo em linguagem natural; quando não está (ou falha), cai para
 * um resumo determinístico baseado só no perfil extraído e na última
 * mensagem do lead — "Assumir conversa" nunca pode falhar por causa da IA
 * (CLAUDE.md §25).
 */
export async function summarizeConversation(
  input: ConversationSummaryInput,
  geminiClient: GeminiClient,
): Promise<ConversationSummaryResult> {
  if (geminiClient.isConfigured) {
    try {
      const prompt = buildPrompt(input);
      const raw = await geminiClient.generateSummary(prompt);
      const text = raw ? takeFirstLines(raw, SUMMARY_LINES) : "";
      if (text) {
        return { text, source: "AI" };
      }
    } catch {
      // Falha inesperada na chamada à IA: cai para o resumo determinístico.
    }
  }

  return { text: buildFallbackSummary(input), source: "FALLBACK" };
}

function buildPrompt(input: ConversationSummaryInput): string {
  const recentHistory = input.history.slice(-HISTORY_LIMIT);
  const historyText = recentHistory
    .map((entry) => `${entry.role === "lead" ? "Lead" : "Atendimento"}: ${entry.text}`)
    .join("\n");

  return `
Você é o assistente de um corretor da ${input.agencyName || "imobiliária"} que está prestes a
assumir manualmente uma conversa que hoje é atendida pela IA.

Escreva um resumo de EXATAMENTE 3 linhas curtas cobrindo, em ordem:
1. O que o lead quer (finalidade, tipo de imóvel, cidade/bairro e orçamento, quando souber).
2. O que já foi descoberto ou combinado na conversa até agora.
3. O que falta ou qual é o próximo passo sugerido.

Nome do lead: ${input.leadName || "não informado"}

Perfil já extraído do lead:
${JSON.stringify(input.profile || {}, null, 2)}

Histórico da conversa (mais recente por último):
${historyText || "(sem histórico)"}

Responda apenas com as 3 linhas do resumo, sem numeração e sem texto adicional.
  `.trim();
}

/** Quebra o texto em linhas, descarta vazias e mantém só as `limit` primeiras. */
function takeFirstLines(text: string, limit: number): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);

  return lines.join("\n");
}

const TRANSACTION_LABELS: Record<string, string> = {
  RENT: "Aluguel",
  BUY: "Compra",
};

/**
 * Resumo sem IA: rede de segurança que garante que assumir uma conversa
 * nunca falha por causa do provedor de IA. Nunca lança exceção.
 */
function buildFallbackSummary(input: ConversationSummaryInput): string {
  const profile = input.profile;

  const profileParts: string[] = [];
  if (profile?.transactionType) {
    profileParts.push(TRANSACTION_LABELS[profile.transactionType] || profile.transactionType);
  }
  if (profile?.propertyType) {
    profileParts.push(profile.propertyType);
  }
  if (profile?.city) {
    profileParts.push(`em ${profile.city}`);
  }
  if (profile?.maxBudget) {
    profileParts.push(`até R$ ${profile.maxBudget.toLocaleString("pt-BR")}`);
  }
  if (profile?.bedrooms) {
    profileParts.push(`${profile.bedrooms} dormitório(s)`);
  }
  const profileLine = profileParts.length > 0 ? profileParts.join(", ") : null;

  const lastLeadMessage = [...input.history].reverse().find((entry) => entry.role === "lead");
  const lastMessageLine = lastLeadMessage ? `Última mensagem do lead: ${lastLeadMessage.text}` : null;

  const lines = [profileLine, lastMessageLine].filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return "Sem informações suficientes para resumir esta conversa ainda.";
  }

  return lines.join("\n");
}
