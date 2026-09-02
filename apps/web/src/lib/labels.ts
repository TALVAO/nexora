import type { Stage, Temperature } from "@nexora/shared";

// Rótulos idênticos aos usados na landing pública (apps/web/src/app/page.tsx)
// para manter a mesma linguagem visual entre as telas. Extraído da Etapa
// 14.2 (estava duplicado em inbox/page.tsx e lead/[id]/page.tsx).
export const STAGE_LABELS: Record<Stage, string> = {
  NEW: "Novo Lead",
  CONTACTED: "Contatado",
  QUALIFYING: "Qualificando",
  QUALIFIED: "Qualificado",
  VISIT_SCHEDULED: "Visita Agendada",
  VISITED: "Visita Realizada",
  PROPOSAL: "Proposta",
  WON: "Fechado (Ganho)",
  LOST: "Perdido",
  DORMANT: "Dormindo",
};

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  HOT: "🔥 Quente",
  WARM: "⚡ Morno",
  COLD: "❄️ Frio",
};
