"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Instagram, MessageCircle, User } from "lucide-react";
import {
  ApiError,
  assumeConversation,
  changeLeadStage,
  getLead360,
  type Channel,
  type ConversationSummary,
  type LeadProfileInfo,
  type MessageItem,
  type Stage,
} from "@/lib/api";
import { STAGE_LABELS, TEMPERATURE_LABELS } from "@/lib/labels";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.";
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Singular/plural simples — o corretor precisa confiar que os jobs pendentes sumiram. */
function formatCancelledFollowups(count: number): string {
  if (count === 0) {
    return "0 follow-ups pendentes.";
  }
  if (count === 1) {
    return "1 follow-up pendente foi cancelado.";
  }
  return `${count} follow-ups pendentes foram cancelados.`;
}

/** Rótulo em pt-BR para o transaction_type — só existem "RENT"/"BUY" hoje. */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  RENT: "Aluguel",
  BUY: "Compra",
};

/** Formata um número como moeda brasileira simples (ex.: "R$ 1.500,00"). */
function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Combina min_budget/max_budget num único texto. Devolve null quando o lead
 * nunca informou faixa nenhuma — a linha some da ficha nesse caso, nunca é
 * substituída por um placeholder (CLAUDE.md §22: nunca inventar dado).
 */
function formatBudgetRange(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) {
    return `${formatBRL(min)} a ${formatBRL(max)}`;
  }
  if (max !== null) {
    return `Até ${formatBRL(max)}`;
  }
  if (min !== null) {
    return `A partir de ${formatBRL(min)}`;
  }
  return null;
}

/**
 * Monta só os pares rótulo/valor que o lead realmente informou. Um campo
 * null/vazio não vira "N/A" nem um valor genérico: a linha inteira some da
 * lista, porque a IA/extrator não pode inventar um dado que não veio do
 * lead (CLAUDE.md §22).
 */
function buildProfileFields(profile: LeadProfileInfo): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];

  if (profile.transaction_type) {
    fields.push({
      label: "Transação",
      value: TRANSACTION_TYPE_LABELS[profile.transaction_type] ?? profile.transaction_type,
    });
  }
  if (profile.property_type) {
    fields.push({ label: "Tipo de imóvel", value: profile.property_type });
  }
  if (profile.city) {
    fields.push({ label: "Cidade", value: profile.city });
  }
  if (profile.neighborhoods.length > 0) {
    fields.push({ label: "Bairros", value: profile.neighborhoods.join(", ") });
  }
  const budget = formatBudgetRange(profile.min_budget, profile.max_budget);
  if (budget) {
    fields.push({ label: "Orçamento", value: budget });
  }
  if (profile.bedrooms !== null) {
    fields.push({ label: "Quartos", value: String(profile.bedrooms) });
  }
  if (profile.bathrooms !== null) {
    fields.push({ label: "Banheiros", value: String(profile.bathrooms) });
  }
  if (profile.parking_spaces !== null) {
    fields.push({ label: "Vagas", value: String(profile.parking_spaces) });
  }
  if (profile.pet_required !== null) {
    // null = pergunta nunca foi respondida (diferente de "false" = respondeu que não aceita).
    fields.push({ label: "Aceita pet", value: profile.pet_required ? "Sim" : "Não" });
  }
  if (profile.move_date) {
    fields.push({ label: "Data de mudança", value: profile.move_date });
  }
  if (profile.rental_guarantee) {
    fields.push({ label: "Garantia locatícia", value: profile.rental_guarantee });
  }

  return fields;
}

/**
 * Descobre o canal (WhatsApp/Instagram) de uma mensagem cruzando seu
 * conversation_id com a lista de conversas do lead — é essa junção que torna
 * a timeline "unificada" de verdade: mensagens de dois canais na mesma lista,
 * mas visualmente distinguíveis.
 */
function findMessageChannel(
  message: MessageItem,
  conversations: ConversationSummary[],
): Channel | null {
  return (
    conversations.find((conversation) => conversation.id === message.conversation_id)?.channel ??
    null
  );
}

function MessageBubble({
  message,
  conversations,
}: {
  message: MessageItem;
  conversations: ConversationSummary[];
}) {
  const isOutbound = message.direction === "OUTBOUND";
  const channel = findMessageChannel(message, conversations);
  const ChannelIcon = channel === "INSTAGRAM" ? Instagram : MessageCircle;

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
          isOutbound ? "bg-brand-600 text-white" : "bg-surface-subtle text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.text ?? "[mídia enviada]"}
        </p>
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] ${
            isOutbound ? "text-white/70" : "text-foreground/50"
          }`}
        >
          <ChannelIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{formatMessageTime(message.sent_at)}</span>
          {message.ai_generated ? <Bot className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Ficha do lead: cabeçalho com o estado atual, a ação "Assumir conversa" e a
 * timeline unificada de mensagens (WhatsApp + Instagram na mesma lista).
 *
 * "Assumir conversa" nunca pode falhar por causa da IA estar indisponível: o
 * resumo de 3 linhas é responsabilidade do backend (com IA quando disponível,
 * determinístico quando não), mas a troca de automation_mode para HUMAN e o
 * cancelamento dos follow-ups pendentes já aconteceram de verdade no banco
 * antes da resposta chegar aqui — esta tela só espelha o que o backend
 * confirmou (CLAUDE.md §25), nunca simula sucesso por conta própria.
 */
export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();

  const leadQuery = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLead360(id),
  });

  const assumeMutation = useMutation({
    mutationFn: () => assumeConversation(id),
    onSuccess: () => {
      // Atualiza esta ficha (automation_mode passa a HUMAN) e qualquer lista
      // de leads já em cache (ex.: a inbox), sem precisar saber a chave exata
      // que cada tela usou para listar.
      void queryClient.invalidateQueries({ queryKey: ["lead", id] });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("leads"),
      });
    },
  });

  // O <select> de estágio é controlado por lead.stage (dado do servidor), não
  // por estado local: assim, se a API rejeitar a mudança, nada precisa ser
  // revertido manualmente — a ficha nunca chega a mostrar um estágio que o
  // backend não confirmou (mesma regra do "Assumir conversa" acima).
  const stageMutation = useMutation({
    mutationFn: (stage: Stage) => changeLeadStage(id, stage),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lead", id] });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("leads"),
      });
    },
  });

  if (leadQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-foreground/60">Carregando...</p>
      </div>
    );
  }

  if (leadQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-700">Erro ao carregar o lead</p>
            <p className="mt-1 text-sm text-red-600">{errorMessage(leadQuery.error)}</p>
          </div>
        </div>
      </div>
    );
  }

  const lead360 = leadQuery.data;
  if (!lead360) {
    // Não deve acontecer fora de loading/error — guarda só para o TypeScript.
    return null;
  }

  const { lead } = lead360;
  const isAiHandling = lead.automation_mode === "AI";
  const profileFields = lead360.profile ? buildProfileFields(lead360.profile) : [];
  // O backend devolve do mais recente pro mais antigo (ORDER BY created_at
  // DESC em lead.repository.ts); invertido aqui porque uma linha do tempo se
  // lê de cima (mais antigo) pra baixo (mais recente).
  const stageHistoryTimeline = [...lead360.stageHistory].reverse();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="rounded-2xl border border-surface-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">
              {lead.name ?? lead.phone ?? "Sem identificação"}
            </h1>
            {lead.phone ? <p className="mt-0.5 text-sm text-foreground/60">{lead.phone}</p> : null}
          </div>

          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isAiHandling ? "bg-surface-subtle text-foreground/70" : "bg-brand-50 text-brand-700"
            }`}
          >
            {isAiHandling ? (
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isAiHandling ? "IA está atendendo" : "Você está atendendo"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-subtle px-2.5 py-1 font-medium text-foreground/70">
            {STAGE_LABELS[lead.stage]}
          </span>
          <span className="rounded-full bg-surface-subtle px-2.5 py-1 font-medium text-foreground/70">
            {TEMPERATURE_LABELS[lead.temperature]}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="lead-stage-select" className="text-xs font-medium text-foreground/60">
            Mudar estágio
          </label>
          <select
            id="lead-stage-select"
            value={lead.stage}
            disabled={stageMutation.isPending}
            onChange={(event) => stageMutation.mutate(event.target.value as Stage)}
            className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>

        {stageMutation.isError ? (
          <p className="mt-2 text-xs text-red-600">{errorMessage(stageMutation.error)}</p>
        ) : null}
      </header>

      {lead360.profile ? (
        <section className="mt-4 rounded-2xl border border-surface-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Perfil de qualificação</h2>
          {profileFields.length > 0 ? (
            <dl className="mt-3 space-y-2">
              {profileFields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <dt className="text-foreground/60">{field.label}</dt>
                  <dd className="text-right font-medium text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-foreground/60">
              Nenhum dado de qualificação extraído ainda.
            </p>
          )}
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-surface-border bg-surface p-4">
        {isAiHandling ? (
          <button
            type="button"
            onClick={() => assumeMutation.mutate()}
            disabled={assumeMutation.isPending}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assumeMutation.isPending ? "Assumindo..." : "Assumir conversa"}
          </button>
        ) : (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-surface-subtle py-3.5 text-sm font-medium text-foreground/70">
            <User className="h-4 w-4" aria-hidden="true" />
            Você está atendendo esta conversa
          </p>
        )}

        {assumeMutation.isError ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <p className="text-sm text-red-600">{errorMessage(assumeMutation.error)}</p>
          </div>
        ) : null}

        {assumeMutation.isSuccess ? (
          <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-3">
            <p className="text-sm font-medium text-brand-700">Resumo da conversa</p>
            <div className="mt-1.5 space-y-0.5 text-sm text-brand-900">
              {assumeMutation.data.summary
                .split("\n")
                .filter((line) => line.trim().length > 0)
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
            <p className="mt-2 text-xs text-brand-700/80">
              {formatCancelledFollowups(assumeMutation.data.cancelledFollowups)}
            </p>
          </div>
        ) : null}
      </section>

      {stageHistoryTimeline.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-surface-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Histórico do funil</h2>
          <ol className="mt-3 space-y-3">
            {stageHistoryTimeline.map((entry) => (
              <li key={entry.id} className="text-sm">
                <p className="font-medium text-foreground">
                  {entry.from_stage ? STAGE_LABELS[entry.from_stage] : "Criação do lead"}
                  {" → "}
                  {STAGE_LABELS[entry.to_stage]}
                </p>
                <p className="mt-0.5 text-xs text-foreground/60">
                  {formatMessageTime(entry.created_at)}
                </p>
                {entry.reason ? (
                  <p className="mt-0.5 text-xs text-foreground/70">{entry.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {lead360.activities.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-surface-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">Atividades</h2>
          <ul className="mt-3 space-y-3">
            {lead360.activities.map((activity) => (
              <li key={activity.id} className="text-sm">
                <p className="text-foreground">{activity.description}</p>
                <p className="mt-0.5 text-xs text-foreground/60">
                  {formatMessageTime(activity.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="text-sm font-medium text-foreground">Conversa</h2>
        <div className="mt-3 space-y-3 overflow-y-auto rounded-2xl border border-surface-border bg-surface p-3">
          {lead360.recentMessages.length ? (
            lead360.recentMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                conversations={lead360.conversations}
              />
            ))
          ) : (
            <p className="py-6 text-center text-sm text-foreground/60">Nenhuma mensagem ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}
