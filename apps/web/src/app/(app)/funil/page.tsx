"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlertTriangle, ChevronRight, Instagram, MessageCircle } from "lucide-react";
import { STAGES } from "@nexora/shared";
import { ApiError, changeLeadStage, listLeads, type LeadRow, type Stage } from "@/lib/api";
import { STAGE_LABELS, TEMPERATURE_LABELS } from "@/lib/labels";

/** Chave de query única para o quadro inteiro — nunca pagina, o corretor
 * precisa ver todos os leads do tenant de uma vez para o Kanban fazer sentido. */
const LEADS_BOARD_QUERY_KEY = ["leads", "board"] as const;

type LeadsResponse = { leads: LeadRow[]; total: number };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Não foi possível mover o lead. Verifique sua conexão e tente novamente.";
}

function formatLeadCount(count: number): string {
  return count === 1 ? "1 lead" : `${count} leads`;
}

/**
 * Cartão de um lead: arrastável (dnd-kit) e, ao mesmo tempo, precisa deixar
 * passar cliques para o link "abrir ficha" e para o <select> de estágio. O
 * dnd-kit ativa o drag no próprio pointerdown do elemento; sem o
 * `stopPropagation` nesses dois controles, tocar neles também dispararia
 * (ou interferiria com) o início de um drag em vez de só clicar/selecionar.
 */
function LeadCard({
  lead,
  onChangeStage,
}: {
  lead: LeadRow;
  onChangeStage: (leadId: string, stage: Stage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const ChannelIcon = lead.source === "INSTAGRAM" ? Instagram : MessageCircle;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        // Evita que o navegador tente rolar a página a partir de um toque
        // que começa em cima do cartão — deixa a decisão (rolar ou arrastar)
        // para o dnd-kit em vez de os dois disputarem o mesmo gesto.
        touchAction: "none",
      }}
      className={`cursor-grab rounded-xl border border-surface-border bg-background p-2.5 shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ChannelIcon className="h-3.5 w-3.5 shrink-0 text-foreground/40" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">
            {lead.name ?? lead.phone ?? "Sem identificação"}
          </span>
        </div>
        <span className="shrink-0 text-xs text-foreground/70">
          {TEMPERATURE_LABELS[lead.temperature]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`stage-select-${lead.id}`}>
          Alterar estágio do lead
        </label>
        <select
          id={`stage-select-${lead.id}`}
          value={lead.stage}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const nextStage = STAGES.find((stage) => stage === event.target.value);
            if (nextStage && nextStage !== lead.stage) {
              onChangeStage(lead.id, nextStage);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface px-1.5 py-1 text-xs text-foreground/80"
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>

        <Link
          href={`/lead/${lead.id}`}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label="Abrir ficha do lead"
          className="shrink-0 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-surface-subtle hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** Coluna de um estágio: área "droppable" que recebe cartões arrastados. */
function FunnelColumn({
  stage,
  leads,
  onChangeStage,
}: {
  stage: Stage;
  leads: LeadRow[];
  onChangeStage: (leadId: string, stage: Stage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[260px] shrink-0 flex-col rounded-2xl border bg-surface transition-colors sm:w-[280px] ${
        isOver ? "border-brand-400 bg-brand-50/40" : "border-surface-border"
      }`}
    >
      <div className="border-b border-surface-border px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</p>
        <p className="text-xs text-foreground/50">{formatLeadCount(leads.length)}</p>
      </div>

      <div className="flex flex-col gap-2 p-2">
        {leads.length ? (
          leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onChangeStage={onChangeStage} />
          ))
        ) : (
          <p className="px-2 py-4 text-center text-xs text-foreground/40">Nenhum lead aqui.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Funil Kanban (Etapa 14.3): os dez estágios como colunas, leads como
 * cartões que podem ser movidos arrastando OU pelo <select> de cada cartão
 * — a segunda forma existe porque arrastar entre dez colunas rolando na
 * horizontal é desconfortável no celular, que é onde o corretor mais usa o
 * sistema. As duas formas chamam exatamente a mesma mutação.
 */
export default function FunilPage() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const leadsQuery = useQuery({
    queryKey: LEADS_BOARD_QUERY_KEY,
    // O Kanban precisa ver todos os leads do tenant de uma vez — não é uma
    // amostra paginada como o /inbox.
    queryFn: () => listLeads({ limit: 200 }),
  });

  // distance:8 evita que um toque simples (sem intenção de arrastar) já
  // dispare o drag — sem isso, o clique no link/select de um cartão correria
  // risco de ser interpretado como o início de um arraste de 0px.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stageMutation = useMutation<
    LeadRow,
    unknown,
    { leadId: string; stage: Stage },
    { previous: LeadsResponse | undefined }
  >({
    mutationFn: ({ leadId, stage }) => changeLeadStage(leadId, stage),
    onMutate: async ({ leadId, stage }) => {
      await queryClient.cancelQueries({ queryKey: LEADS_BOARD_QUERY_KEY });

      const previous = queryClient.getQueryData<LeadsResponse>(LEADS_BOARD_QUERY_KEY);

      if (previous) {
        queryClient.setQueryData<LeadsResponse>(LEADS_BOARD_QUERY_KEY, {
          ...previous,
          leads: previous.leads.map((lead) =>
            lead.id === leadId ? { ...lead, stage } : lead,
          ),
        });
      }

      // Guardado para o onError poder devolver o cartão pra coluna original
      // — a UI nunca pode ficar mostrando uma mudança que a API rejeitou.
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LEADS_BOARD_QUERY_KEY, context.previous);
      }

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast(errorMessage(error));
      toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
    },
    onSettled: () => {
      // Mesma técnica do /lead/[id] (Etapa 14.2): invalida qualquer query
      // cuja chave comece com "leads", mantendo /inbox e este quadro
      // coerentes entre si depois de uma mudança de estágio.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("leads"),
      });
    },
  });

  function handleChangeStage(leadId: string, stage: Stage) {
    stageMutation.mutate({ leadId, stage });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    const newStage = STAGES.find((stage) => stage === over.id);
    const lead = leads.find((item) => item.id === active.id);
    if (!newStage || !lead || lead.stage === newStage) {
      return;
    }

    handleChangeStage(lead.id, newStage);
  }

  const leads = leadsQuery.data?.leads ?? [];

  if (leadsQuery.isLoading) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-foreground/60">Carregando funil...</p>
      </div>
    );
  }

  if (leadsQuery.isError) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-700">Erro ao carregar o funil</p>
            <p className="mt-1 text-sm text-red-600">{errorMessage(leadsQuery.error)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="px-4">
        <h1 className="text-xl font-semibold text-foreground">Funil</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Arraste um lead para outra coluna ou use o seletor do cartão para mudar o estágio.
        </p>
      </div>

      {toast ? (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-600">{toast}</p>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="mt-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {STAGES.map((stage) => (
            <FunnelColumn
              key={stage}
              stage={stage}
              leads={leads.filter((lead) => lead.stage === stage)}
              onChangeStage={handleChangeStage}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
