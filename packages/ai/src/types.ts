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

export interface NextActionDecision {
  action: "ASK_QUESTION" | "SUGGEST_PROPERTY" | "HANDOFF_HUMAN" | "CONFIRM_VISIT" | "OPT_OUT";
  questionToAsk?: string;
  reason: string;
  confidence: number;
}
