import type { AIExecutionContext, GeneratedResponse, AIRunRecord } from "./types.js";
import { IntentClassifier } from "./intent-classifier.js";
import { StructuredExtractor } from "./structured-extractor.js";
import { NextActionPolicy } from "./next-action-policy.js";
import { ResponseGenerator } from "./response-generator.js";

export class ConversationEngine {
  private classifier: IntentClassifier;
  private extractor: StructuredExtractor;
  private policy: NextActionPolicy;
  private generator: ResponseGenerator;

  constructor() {
    this.classifier = new IntentClassifier();
    this.extractor = new StructuredExtractor();
    this.policy = new NextActionPolicy();
    this.generator = new ResponseGenerator();
  }

  processMessage(context: AIExecutionContext): {
    response: GeneratedResponse;
    aiRun: AIRunRecord;
  } {
    const startTime = Date.now();

    // 1. Intent Classification
    const intentResult = this.classifier.classify(context.lastMessageText);

    // 2. Structured Extraction (incorporating previous profile state)
    const extractionResult = this.extractor.extract(
      context.lastMessageText,
      context.currentProfile,
    );

    // 3. Next Action Policy Decision
    const nextAction = this.policy.decide(
      intentResult.intent,
      extractionResult.profile,
      intentResult.confidence,
    );

    // 4. Response Generation with Guardrails
    const responseText = this.generator.generate({
      intent: intentResult.intent,
      profile: extractionResult.profile,
      decision: nextAction,
      lastMessageText: context.lastMessageText,
      agencyName: context.agencyName,
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
}
