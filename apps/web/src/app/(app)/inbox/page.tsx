"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Instagram, MessageCircle, User } from "lucide-react";
import {
  ApiError,
  listLeads,
  type AutomationMode,
  type Channel,
  type LeadRow,
  type Temperature,
} from "@/lib/api";
import { STAGE_LABELS } from "@/lib/labels";

const TEMPERATURE_EMOJI: Record<Temperature, string> = {
  HOT: "🔥",
  WARM: "⚡",
  COLD: "❄️",
};

const CHANNEL_ICON: Record<Channel, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  INSTAGRAM: Instagram,
};

const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

const AUTOMATION_ICON: Record<AutomationMode, typeof Bot> = {
  AI: Bot,
  HUMAN: User,
};

const AUTOMATION_LABEL: Record<AutomationMode, string> = {
  AI: "Em atendimento automático (IA)",
  HUMAN: "Assumido por um humano",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.";
}

/**
 * Tempo relativo simples (minutos/horas/dias) a partir de uma data ISO. Não
 * precisa de biblioteca: é só aritmética sobre a diferença para agora.
 */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "agora";
  }
  if (diffMinutes < 60) {
    return `há ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `há ${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
}

/** A API não garante ordenação — o mais recente primeiro é decidido aqui. */
function sortByMostRecentlyUpdated(leads: LeadRow[]): LeadRow[] {
  return [...leads].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

/**
 * Inbox unificado (Etapa 14.2): a lista de leads que o corretor abre todo
 * dia, WhatsApp e Instagram misturados. A timeline de conversa e o botão
 * "Assumir conversa" vivem na tela de detalhe (/lead/[id]), aberta a partir
 * de cada item aqui.
 */
export default function InboxPage() {
  const leadsQuery = useQuery({
    queryKey: ["leads", "list"],
    queryFn: () => listLeads({ limit: 50 }),
  });

  const leads = leadsQuery.data ? sortByMostRecentlyUpdated(leadsQuery.data.leads) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Conversas de WhatsApp e Instagram, todas em um só lugar.
      </p>

      {leadsQuery.isLoading ? (
        <p className="mt-6 text-sm text-foreground/60">Carregando leads...</p>
      ) : leadsQuery.error ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-700">Erro ao carregar leads</p>
            <p className="mt-1 text-sm text-red-600">{errorMessage(leadsQuery.error)}</p>
          </div>
        </div>
      ) : leads.length ? (
        <ul className="mt-6 divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-surface">
          {leads.map((lead) => {
            const ChannelIcon = CHANNEL_ICON[lead.source];
            const AutomationIcon = AUTOMATION_ICON[lead.automation_mode];

            return (
              <li key={lead.id}>
                <Link
                  href={`/lead/${lead.id}`}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-subtle"
                >
                  <ChannelIcon
                    className="h-5 w-5 shrink-0 text-foreground/50"
                    aria-hidden="true"
                  >
                    <title>{CHANNEL_LABEL[lead.source]}</title>
                  </ChannelIcon>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {lead.name ?? lead.phone ?? "Sem identificação"}
                      </span>
                      <span aria-hidden="true">{TEMPERATURE_EMOJI[lead.temperature]}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-foreground/60">
                      {STAGE_LABELS[lead.stage]} · {formatRelativeTime(lead.updated_at)}
                    </p>
                  </div>

                  <AutomationIcon
                    className="h-4 w-4 shrink-0 text-foreground/40"
                    aria-hidden="true"
                  >
                    <title>{AUTOMATION_LABEL[lead.automation_mode]}</title>
                  </AutomationIcon>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-surface-border bg-surface p-4">
          <p className="text-sm text-foreground/60">Nenhum lead ainda.</p>
        </div>
      )}
    </div>
  );
}
