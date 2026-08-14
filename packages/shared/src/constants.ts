export const APP_NAME = "Nexora";
export const DEFAULT_PAGE_SIZE = 20;

export const STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFYING",
  "QUALIFIED",
  "VISIT_SCHEDULED",
  "VISITED",
  "PROPOSAL",
  "WON",
  "LOST",
  "DORMANT",
] as const;

export const ROLES = ["OWNER", "MANAGER", "AGENT", "VIEWER"] as const;

export const CHANNELS = ["WHATSAPP", "INSTAGRAM"] as const;

export const AUTOMATION_MODES = ["AI", "HUMAN"] as const;

export const TEMPERATURES = ["HOT", "WARM", "COLD"] as const;

export const FOLLOWUP_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "CANCELLED",
  "BLOCKED",
  "FAILED",
] as const;

export const VISIT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
