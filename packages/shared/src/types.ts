import type { STAGES, ROLES, CHANNELS, AUTOMATION_MODES, TEMPERATURES } from "./constants.js";

export type Stage = (typeof STAGES)[number];
export type Role = (typeof ROLES)[number];
export type Channel = (typeof CHANNELS)[number];
export type AutomationMode = (typeof AUTOMATION_MODES)[number];
export type Temperature = (typeof TEMPERATURES)[number];

export interface BaseEntity {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  timestamp: string;
  uptime: number;
}
