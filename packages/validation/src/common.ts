import { z } from "zod";
import { STAGES, ROLES, CHANNELS, AUTOMATION_MODES } from "@nexora/shared";

export const uuidSchema = z.string().uuid({ message: "ID deve ser um UUID válido" });

export const stageSchema = z.enum(STAGES);
export const roleSchema = z.enum(ROLES);
export const channelSchema = z.enum(CHANNELS);
export const automationModeSchema = z.enum(AUTOMATION_MODES);

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type EnvConfig = z.infer<typeof envSchema>;
