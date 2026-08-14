import type { BaseEntity, Stage, AutomationMode } from "@nexora/shared";

export interface Tenant extends BaseEntity {
  name: string;
  slug: string;
  isActive: boolean;
}

export interface LeadEntity extends BaseEntity {
  name?: string;
  phone?: string;
  email?: string;
  stage: Stage;
  automationMode: AutomationMode;
  assignedUserId?: string;
}
