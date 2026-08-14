export type LeadIntent =
  | "GREETING"
  | "RENTAL_SEARCH"
  | "PURCHASE_SEARCH"
  | "PROPERTY_QUESTION"
  | "SCHEDULE_VISIT"
  | "RESCHEDULE"
  | "CANCEL_VISIT"
  | "DOCUMENTATION"
  | "PRICE_NEGOTIATION"
  | "HUMAN_REQUEST"
  | "COMPLAINT"
  | "STOP_MESSAGES"
  | "OTHER";

export interface ExtractedLeadProfile {
  transactionType?: "RENT" | "BUY" | null;
  propertyType?: string | null;
  city?: string | null;
  neighborhoods?: string[];
  maxBudget?: number | null;
  bedrooms?: number | null;
  parkingSpaces?: number | null;
  hasPet?: boolean | null;
  moveDate?: string | null;
  rentalGuarantee?: string | null;
  notes?: string | null;
}

export interface IntentClassificationResult {
  intent: LeadIntent;
  confidence: number;
  explanation?: string;
}

export interface ExtractionResult {
  profile: ExtractedLeadProfile;
  confidence: number;
}

export interface NextActionDecision {
  action:
    "ASK_QUESTION" | "SUGGEST_PROPERTY" | "HANDOFF_HUMAN" | "CONFIRM_VISIT" | "OPT_OUT" | "GREET";
  questionToAsk?: string;
  handoffReason?: string;
  reason: string;
  confidence: number;
}

export interface GeneratedResponse {
  text: string;
  shouldHandoff: boolean;
  handoffReason?: string;
  confidence: number;
  intent: LeadIntent;
  extractedProfile: ExtractedLeadProfile;
  nextAction: NextActionDecision;
}

export interface AIExecutionContext {
  tenantId: string;
  leadId: string;
  conversationId: string;
  lastMessageText: string;
  conversationHistory?: Array<{
    role: "lead" | "assistant" | "system";
    text: string;
  }>;
  currentProfile?: ExtractedLeadProfile;
  agencyName?: string;
}

export interface AIRunRecord {
  tenantId: string;
  conversationId: string;
  leadId: string;
  intent: LeadIntent;
  confidence: number;
  extractedData: ExtractedLeadProfile;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  model: string;
}
