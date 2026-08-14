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
