import type { Stage, Role, Channel, AutomationMode, AvailabilitySource } from "@nexora/shared";

export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type TemperatureType = "HOT" | "WARM" | "COLD";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type SenderType = "LEAD" | "AI" | "USER" | "SYSTEM";
export type MessageType =
  "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "LOCATION" | "REACTION" | "UNKNOWN";
export type ActivityType =
  "CALL" | "VISIT" | "FOLLOW_UP" | "NOTE" | "PROPOSAL" | "DOCUMENT" | "OTHER";
export type VisitStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type PropertyStatus = "AVAILABLE" | "RENTED" | "SOLD" | "RESERVED" | "INACTIVE";
export type FollowupStatus = "PENDING" | "PROCESSING" | "SENT" | "CANCELLED" | "BLOCKED" | "FAILED";
export type ActorType = "USER" | "LEAD" | "SYSTEM" | "AI";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  /** Janela (horas) em que a verificação de disponibilidade pode ser afirmada. */
  availability_fresh_hours: number;
  /** Prazo (horas) a partir do qual a verificação está vencida. */
  availability_stale_hours: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMemberRow {
  id: string;
  tenant_id: string;
  profile_id: string;
  role: Role;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface LeadRow {
  id: string;
  tenant_id: string;
  assigned_user_id: string | null;
  name: string | null;
  phone: string | null;
  instagram_user_id: string | null;
  email: string | null;
  source: Channel;
  intent: string | null;
  stage: Stage;
  temperature: TemperatureType;
  score: number;
  automation_mode: AutomationMode;
  first_contact_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_action_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadProfileRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  transaction_type: string | null;
  property_type: string | null;
  city: string | null;
  neighborhoods: string[];
  min_budget: number | null;
  max_budget: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  pet_required: boolean | null;
  move_date: string | null;
  rental_guarantee: string | null;
  financing_interest: boolean | null;
  qualification_complete: boolean;
  qualification_confidence: number;
  structured_preferences_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  channel: Channel;
  provider: string;
  external_conversation_id: string | null;
  status: string;
  assigned_user_id: string | null;
  automation_mode: AutomationMode;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  tenant_id: string;
  conversation_id: string;
  lead_id: string;
  external_message_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  message_type: MessageType;
  text: string | null;
  media_url: string | null;
  provider_status: string | null;
  ai_generated: boolean;
  ai_run_id: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VisitRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  property_id: string | null;
  assigned_user_id: string | null;
  scheduled_at: string;
  status: VisitStatus;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyRow {
  id: string;
  tenant_id: string;
  external_id: string | null;
  title: string;
  transaction_type: string;
  property_type: string | null;
  city: string;
  neighborhood: string | null;
  price: number;
  condo_fee: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  pets_allowed: boolean | null;
  rental_guarantees_json: unknown[];
  status: PropertyStatus;
  /** Origem da última afirmação de disponibilidade (migration 05). */
  availability_source: AvailabilitySource;
  /** Quando a disponibilidade foi afirmada. NULL = nunca verificada. */
  availability_verified_at: string | null;
  url: string | null;
  main_image_url: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FollowupJobRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  conversation_id: string | null;
  sequence_id: string | null;
  step_id: string | null;
  scheduled_at: string;
  status: FollowupStatus;
  attempts: number;
  cancel_reason: string | null;
  blocked_reason: string | null;
  provider_message_id: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}
