import type { AIExecutionContext, GeneratedResponse, AIRunRecord } from "./types.js";
import { IntentClassifier } from "./intent-classifier.js";
import { StructuredExtractor } from "./structured-extractor.js";
import { NextActionPolicy } from "./next-action-policy.js";
import { ResponseGenerator } from "./response-generator.js";
import { GeminiClient } from "./gemini-client.js";

export class ConversationEngine {
  private classifier: IntentClassifier;
  private extractor: StructuredExtractor;
  private policy: NextActionPolicy;
  private generator: ResponseGenerator;
  private geminiClient: GeminiClient;

  constructor() {
    this.classifier = new IntentClassifier();
    this.extractor = new StructuredExtractor();
    this.policy = new NextActionPolicy();
    this.generator = new ResponseGenerator();
    this.geminiClient = new GeminiClient();
  }

  /**
   * Processamento síncrono baseado em regras determinísticas e guardrails.
   */
  processMessage(context: AIExecutionContext): {
    response: GeneratedResponse;
    aiRun: AIRunRecord;
  } {
    const startTime = Date.now();

    // 1. Intent Classification
    const intentResult = this.classifier.classify(context.lastMessageText, context.vocabulary);

    // 2. Structured Extraction (incorporating previous profile state)
    const extractionResult = this.extractor.extract(
      context.lastMessageText,
      context.currentProfile,
      context.vocabulary,
    );

    // 3. Next Action Policy Decision
    // O tenant só é perguntado sobre bairro se o sistema souber reconhecer a
    // resposta dele — e quem reconhece bairro é a lista de BAIRROS. Ter apenas
    // cidades cadastradas não ajuda: o lead responde "Boa Viagem" e a extração
    // continua vazia, devolvendo a mesma pergunta para sempre.
    //
    // Quando o vocabulário não chegou (falha de leitura), não afirmamos nada:
    // sem a opção, a política mantém o roteiro normal.
    const policyOptions =
      context.vocabulary === undefined
        ? undefined
        : { hasGeography: context.vocabulary.neighborhoods.length > 0 };

    const nextAction = this.policy.decide(
      intentResult.intent,
      extractionResult.profile,
      intentResult.confidence,
      policyOptions,
    );

    // 4. Response Generation with Guardrails
    const responseText = this.generator.generate({
      intent: intentResult.intent,
      profile: extractionResult.profile,
      decision: nextAction,
      lastMessageText: context.lastMessageText,
      agencyName: context.agencyName,
      availability: context.availability,
    });

    const shouldHandoff = nextAction.action === "HANDOFF_HUMAN";
    const latencyMs = Date.now() - startTime;

    const response: GeneratedResponse = {
      text: responseText,
      shouldHandoff,
      handoffReason: nextAction.handoffReason,
      confidence: intentResult.confidence,
      intent: intentResult.intent,
      extractedProfile: extractionResult.profile,
      nextAction,
    };

    const aiRun: AIRunRecord = {
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      leadId: context.leadId,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      extractedData: extractionResult.profile,
      promptTokens: Math.ceil(context.lastMessageText.length / 4),
      completionTokens: Math.ceil(responseText.length / 4),
      latencyMs,
      model: "deterministic-nlp-v1",
    };

    return { response, aiRun };
  }

  /**
   * Processamento assíncrono com suporte ao Google Gemini (com fallback automático).
   */
  async processMessageAsync(context: AIExecutionContext): Promise<{
    response: GeneratedResponse;
    aiRun: AIRunRecord;
  }> {
    const startTime = Date.now();

    if (this.geminiClient.isConfigured) {
      const geminiResult = await this.geminiClient.generateResponse(context);
      if (geminiResult) {
        const latencyMs = Date.now() - startTime;
        const aiRun: AIRunRecord = {
          tenantId: context.tenantId,
          conversationId: context.conversationId,
          leadId: context.leadId,
          intent: geminiResult.intent,
          confidence: geminiResult.confidence,
          extractedData: geminiResult.extractedProfile,
          promptTokens: Math.ceil(context.lastMessageText.length / 4),
          completionTokens: Math.ceil(geminiResult.text.length / 4),
          latencyMs,
          model: this.geminiClient.modelName,
        };
        return { response: geminiResult, aiRun };
      }
    }

    // Fallback determinístico
    return this.processMessage(context);
  }
}
