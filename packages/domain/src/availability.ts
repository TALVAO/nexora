/**
 * Confiança na disponibilidade de um imóvel (Etapa 15.1).
 *
 * Regra de ouro da Fase 15: **a IA nunca afirma disponibilidade sem carimbo de
 * origem e data dentro do prazo do tenant** (CLAUDE.md §23, §31).
 *
 * O banco guarda os fatos — `status`, `availability_source`,
 * `availability_verified_at`. A conclusão ("posso afirmar que está
 * disponível?") é calculada aqui, porque ela depende do tempo: o mesmo
 * registro é confiável hoje e duvidoso daqui a três semanas, sem que nenhum
 * UPDATE aconteça. Ver a nota longa na migration 05.
 */

import type { AvailabilitySource } from "@nexora/shared";

export type { AvailabilitySource };

/**
 * - `UNAVAILABLE`  — o imóvel não está como disponível. Não há o que afirmar.
 * - `UNVERIFIED`   — ninguém nunca registrou uma verificação.
 * - `FRESH`        — verificado dentro da janela do tenant. **Único estado em
 *                    que a IA pode afirmar disponibilidade.**
 * - `AGING`        — verificado, mas fora da janela fresca: confirmar antes de
 *                    prometer qualquer coisa ao lead.
 * - `EXPIRED`      — verificação vencida pelo prazo do tenant.
 */
export type AvailabilityConfidence =
  | "UNAVAILABLE"
  | "UNVERIFIED"
  | "FRESH"
  | "AGING"
  | "EXPIRED";

export interface AvailabilityPolicy {
  /** Até esta idade (horas) a verificação é fresca e pode ser afirmada. */
  freshHours: number;
  /** Acima desta idade (horas) a verificação está vencida. */
  staleHours: number;
}

/** Espelha os defaults da migration 05 (`tenants.availability_*_hours`). */
export const DEFAULT_AVAILABILITY_POLICY: AvailabilityPolicy = {
  freshHours: 24,
  staleHours: 168,
};

export interface AvailabilityFacts {
  /** `properties.status` — só `AVAILABLE` pode ser afirmado. */
  status: string;
  /** `properties.availability_verified_at`. NULL = nunca verificado. */
  verifiedAt: string | Date | null;
  /** `properties.availability_source`. */
  source: AvailabilitySource;
}

export interface AvailabilityAssessment {
  confidence: AvailabilityConfidence;
  /** Autoriza uma frase afirmativa de disponibilidade. Só é `true` em `FRESH`. */
  canAssert: boolean;
  /** O corretor precisa confirmar antes de o sistema prometer algo ao lead. */
  needsReconfirmation: boolean;
  /** Idade da verificação em horas, arredondada. `null` se nunca verificada. */
  ageHours: number | null;
  verifiedAt: string | null;
  source: AvailabilitySource;
  /** Explicação em pt-BR — aparece para o corretor, não para o lead. */
  reason: string;
}

const MS_PER_HOUR = 3_600_000;

/**
 * Tolerância para diferença de relógio entre a aplicação e o banco. Sem isso,
 * um imóvel confirmado neste exato segundo poderia aparecer com idade negativa
 * e cair em `UNVERIFIED`. Acima dessa folga, a data futura é dado corrompido e
 * o resultado falha para o lado seguro.
 */
const CLOCK_SKEW_TOLERANCE_HOURS = 1;

/** Normaliza a política do tenant, caindo no default quando o valor não presta. */
export function resolveAvailabilityPolicy(
  policy?: Partial<AvailabilityPolicy> | null,
): AvailabilityPolicy {
  const freshHours =
    typeof policy?.freshHours === "number" && policy.freshHours > 0
      ? policy.freshHours
      : DEFAULT_AVAILABILITY_POLICY.freshHours;

  const staleHours =
    typeof policy?.staleHours === "number" && policy.staleHours >= freshHours
      ? policy.staleHours
      : Math.max(freshHours, DEFAULT_AVAILABILITY_POLICY.staleHours);

  return { freshHours, staleHours };
}

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Decide o quanto se pode confiar na disponibilidade de um imóvel.
 *
 * Fail closed: qualquer dúvida (status diferente de disponível, sem carimbo,
 * carimbo ilegível, carimbo no futuro além da folga de relógio) resulta em
 * `canAssert: false`.
 */
export function assessAvailability(
  facts: AvailabilityFacts,
  policy?: Partial<AvailabilityPolicy> | null,
  now: Date = new Date(),
): AvailabilityAssessment {
  const { freshHours, staleHours } = resolveAvailabilityPolicy(policy);
  const verifiedAtDate = toDate(facts.verifiedAt);
  const verifiedAt = verifiedAtDate ? verifiedAtDate.toISOString() : null;

  const base = { verifiedAt, source: facts.source };

  if (facts.status !== "AVAILABLE") {
    return {
      ...base,
      confidence: "UNAVAILABLE",
      canAssert: false,
      needsReconfirmation: false,
      ageHours: null,
      reason: `Imóvel não está disponível (status ${facts.status}).`,
    };
  }

  if (!verifiedAtDate) {
    return {
      ...base,
      confidence: "UNVERIFIED",
      canAssert: false,
      needsReconfirmation: true,
      ageHours: null,
      reason: "Disponibilidade nunca foi verificada.",
    };
  }

  const rawAgeHours = (now.getTime() - verifiedAtDate.getTime()) / MS_PER_HOUR;

  if (rawAgeHours < -CLOCK_SKEW_TOLERANCE_HOURS) {
    return {
      ...base,
      confidence: "UNVERIFIED",
      canAssert: false,
      needsReconfirmation: true,
      ageHours: null,
      reason: "Data de verificação está no futuro — registro inconsistente.",
    };
  }

  const ageHours = Math.max(0, Math.round(rawAgeHours));

  if (rawAgeHours <= freshHours) {
    return {
      ...base,
      confidence: "FRESH",
      canAssert: true,
      needsReconfirmation: false,
      ageHours,
      reason: `Verificado há ${ageHours}h (limite de ${freshHours}h).`,
    };
  }

  if (rawAgeHours <= staleHours) {
    return {
      ...base,
      confidence: "AGING",
      canAssert: false,
      needsReconfirmation: true,
      ageHours,
      reason: `Verificado há ${ageHours}h, acima do limite de ${freshHours}h para afirmar.`,
    };
  }

  return {
    ...base,
    confidence: "EXPIRED",
    canAssert: false,
    needsReconfirmation: true,
    ageHours,
    reason: `Verificação vencida: ${ageHours}h, acima do prazo de ${staleHours}h do tenant.`,
  };
}
