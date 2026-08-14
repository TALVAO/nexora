"use client";

import { useState } from "react";
import {
  Users,
  Flame,
  Bot,
  Calendar,
  Search,
  Filter,
  Columns3,
  List,
  MessageSquare,
  UserCheck,
  Send,
  Building2,
  ChevronRight,
  Phone,
  X,
  FileText,
  Activity as ActivityIcon,
} from "lucide-react";

type Stage =
  | "NEW"
  | "CONTACTED"
  | "QUALIFYING"
  | "QUALIFIED"
  | "VISIT_SCHEDULED"
  | "VISITED"
  | "PROPOSAL"
  | "WON"
  | "LOST"
  | "DORMANT";

type Temperature = "HOT" | "WARM" | "COLD";
type AutomationMode = "AI" | "HUMAN";
type Channel = "WHATSAPP" | "INSTAGRAM";

interface LeadItem {
  id: string;
  name: string;
  phone: string;
  source: Channel;
  stage: Stage;
  temperature: Temperature;
  score: number;
  automationMode: AutomationMode;
  intent: string;
  lastMessage: string;
  lastMessageAt: string;
  profile: {
    transactionType: "RENT" | "BUY";
    propertyType: string;
    city: string;
    neighborhoods: string[];
    maxBudget: number;
    bedrooms: number;
    parkingSpaces: number;
    hasPet: boolean;
    moveDate: string;
    rentalGuarantee: string;
  };
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
  messages: Array<{
    id: string;
    sender: "lead" | "ai" | "user";
    text: string;
    time: string;
  }>;
}

const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: "NEW", label: "Novo Lead", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  {
    key: "CONTACTED",
    label: "Contatado",
    color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  },
  {
    key: "QUALIFYING",
    label: "Qualificando",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  {
    key: "QUALIFIED",
    label: "Qualificado",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    key: "VISIT_SCHEDULED",
    label: "Visita Agendada",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  {
    key: "VISITED",
    label: "Visita Realizada",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  { key: "PROPOSAL", label: "Proposta", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  {
    key: "WON",
    label: "Fechado (Ganho)",
    color: "bg-emerald-600/30 text-emerald-300 border-emerald-500/40",
  },
  { key: "LOST", label: "Perdido", color: "bg-zinc-700/30 text-zinc-400 border-zinc-600/30" },
  { key: "DORMANT", label: "Dormindo", color: "bg-zinc-800/40 text-zinc-500 border-zinc-700/30" },
];

const INITIAL_LEADS: LeadItem[] = [
  {
    id: "lead-1",
    name: "Mariana Alcantara",
    phone: "(11) 98844-2211",
    source: "WHATSAPP",
    stage: "QUALIFIED",
    temperature: "HOT",
    score: 88,
    automationMode: "AI",
    intent: "Locação Eloy Chaves 2Q",
    lastMessage: "Excelente! Já estou buscando as melhores opções disponíveis com esse perfil.",
    lastMessageAt: "Há 12 min",
    profile: {
      transactionType: "RENT",
      propertyType: "Apartamento",
      city: "Jundiaí",
      neighborhoods: ["Eloy Chaves", "Retiro"],
      maxBudget: 3500,
      bedrooms: 2,
      parkingSpaces: 1,
      hasPet: true,
      moveDate: "Este mês",
      rentalGuarantee: "Caução",
    },
    activities: [
      {
        id: "a1",
        type: "STAGE",
        description: "Avançado de QUALIFYING para QUALIFIED via IA",
        createdAt: "19:24",
      },
      {
        id: "a2",
        type: "AI",
        description: "Critérios de busca e orçamento R$ 3.500 extraídos",
        createdAt: "19:22",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "lead",
        text: "Olá, busco apto de 2 quartos no Eloy Chaves para alugar até 3500",
        time: "19:22",
      },
      {
        id: "m2",
        sender: "ai",
        text: "Excelente! Entendi que você procura um imóvel para locação de 2 quartos no Eloy Chaves até R$ 3.500. Já estou buscando as opções para você!",
        time: "19:24",
      },
    ],
  },
  {
    id: "lead-2",
    name: "Dr. Roberto Santos",
    phone: "(11) 97722-4499",
    source: "WHATSAPP",
    stage: "VISIT_SCHEDULED",
    temperature: "HOT",
    score: 95,
    automationMode: "HUMAN",
    intent: "Compra Casa Condomínio",
    lastMessage: "Visita confirmada para sábado às 10h no condomínio Reserva da Serra.",
    lastMessageAt: "Há 35 min",
    profile: {
      transactionType: "BUY",
      propertyType: "Casa em Condomínio",
      city: "Jundiaí",
      neighborhoods: ["Medeiros", "Malota"],
      maxBudget: 1400000,
      bedrooms: 3,
      parkingSpaces: 2,
      hasPet: true,
      moveDate: "Em 60 dias",
      rentalGuarantee: "N/A (Compra)",
    },
    activities: [
      {
        id: "a3",
        type: "VISIT",
        description: "Visita agendada para Sábado 10:00",
        createdAt: "18:40",
      },
      {
        id: "a4",
        type: "TAKEOVER",
        description: "Corretor assumiu atendimento humano",
        createdAt: "18:35",
      },
    ],
    messages: [
      {
        id: "m3",
        sender: "lead",
        text: "Gostaria de agendar visita na casa de 3 quartos no Reserva da Serra",
        time: "18:30",
      },
      {
        id: "m4",
        sender: "ai",
        text: "Com certeza! Para qual dia e horário você prefere agendar?",
        time: "18:31",
      },
      {
        id: "m5",
        sender: "user",
        text: "Perfeito Dr. Roberto! Visita confirmada para sábado às 10h. Te aguardo na portaria.",
        time: "18:40",
      },
    ],
  },
  {
    id: "lead-3",
    name: "Camila Ferreira",
    phone: "(11) 96633-8822",
    source: "INSTAGRAM",
    stage: "QUALIFYING",
    temperature: "WARM",
    score: 60,
    automationMode: "AI",
    intent: "Locação Centro / Vila Arens",
    lastMessage: "De quantos quartos ou dormitórios você precisa?",
    lastMessageAt: "Há 1h",
    profile: {
      transactionType: "RENT",
      propertyType: "Apartamento",
      city: "Jundiaí",
      neighborhoods: ["Centro", "Vila Arens"],
      maxBudget: 2800,
      bedrooms: 0,
      parkingSpaces: 1,
      hasPet: false,
      moveDate: "Próximo mês",
      rentalGuarantee: "Seguro Fiança",
    },
    activities: [
      {
        id: "a5",
        type: "LEAD",
        description: "Lead originado via Instagram Direct",
        createdAt: "17:15",
      },
    ],
    messages: [
      {
        id: "m6",
        sender: "lead",
        text: "Vi o imóvel no feed no Centro, qual o valor?",
        time: "17:15",
      },
      {
        id: "m7",
        sender: "ai",
        text: "Olá! O valor do aluguel é de R$ 2.400. De quantos quartos você precisa?",
        time: "17:16",
      },
    ],
  },
  {
    id: "lead-4",
    name: "Fernando Mendonça",
    phone: "(11) 95511-3377",
    source: "WHATSAPP",
    stage: "NEW",
    temperature: "COLD",
    score: 25,
    automationMode: "AI",
    intent: "Saudação Inicial",
    lastMessage: "Olá! Como posso te ajudar hoje? Você procura alugar ou comprar?",
    lastMessageAt: "Há 3h",
    profile: {
      transactionType: "RENT",
      propertyType: "Pendente",
      city: "Jundiaí",
      neighborhoods: [],
      maxBudget: 0,
      bedrooms: 0,
      parkingSpaces: 0,
      hasPet: false,
      moveDate: "",
      rentalGuarantee: "",
    },
    activities: [
      {
        id: "a6",
        type: "LEAD",
        description: "Primeiro contato inbound via WhatsApp",
        createdAt: "15:00",
      },
    ],
    messages: [
      { id: "m8", sender: "lead", text: "Boa tarde", time: "15:00" },
      {
        id: "m9",
        sender: "ai",
        text: "Olá! Tudo bem? Sou o assistente da imobiliária. Você está procurando um imóvel para alugar ou para comprar?",
        time: "15:01",
      },
    ],
  },
];

export default function CRMPage() {
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_LEADS);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(INITIAL_LEADS[0] || null);
  const [activeTab, setActiveTab] = useState<"chat" | "profile" | "timeline">("chat");
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<string>("ALL");
  const [filterTemp, setFilterTemp] = useState<string>("ALL");
  const [filterAuto, setFilterAuto] = useState<string>("ALL");
  const [newNoteInput, setNewNoteInput] = useState("");

  // Metrics
  const totalLeads = leads.length;
  const hotLeads = leads.filter((l) => l.temperature === "HOT").length;
  const aiLeads = leads.filter((l) => l.automationMode === "AI").length;
  const visits = leads.filter((l) => l.stage === "VISIT_SCHEDULED" || l.stage === "VISITED").length;

  // Filtered Leads
  const filteredLeads = leads.filter((lead) => {
    if (filterStage !== "ALL" && lead.stage !== filterStage) return false;
    if (filterTemp !== "ALL" && lead.temperature !== filterTemp) return false;
    if (filterAuto !== "ALL" && lead.automationMode !== filterAuto) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = lead.name.toLowerCase().includes(q);
      const matchPhone = lead.phone.includes(q);
      const matchIntent = lead.intent.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchIntent) return false;
    }
    return true;
  });

  // Handle Send Message
  const handleSendMessage = () => {
    if (!chatInput.trim() || !selectedLead) return;
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: "user" as const,
      text: chatInput,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updated = leads.map((l) => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          lastMessage: chatInput,
          lastMessageAt: "Agora",
          messages: [...l.messages, newMsg],
        };
      }
      return l;
    });

    setLeads(updated);
    setSelectedLead({
      ...selectedLead,
      lastMessage: chatInput,
      lastMessageAt: "Agora",
      messages: [...selectedLead.messages, newMsg],
    });
    setChatInput("");
  };

  // Toggle Human Takeover
  const handleToggleTakeover = (leadId: string) => {
    const updated = leads.map((l) => {
      if (l.id === leadId) {
        const nextMode =
          l.automationMode === "AI" ? ("HUMAN" as AutomationMode) : ("AI" as AutomationMode);
        return { ...l, automationMode: nextMode };
      }
      return l;
    });
    setLeads(updated);
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({
        ...selectedLead,
        automationMode: selectedLead.automationMode === "AI" ? "HUMAN" : "AI",
      });
    }
  };

  // Change Stage
  const handleChangeStage = (leadId: string, newStage: Stage) => {
    const updated = leads.map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          stage: newStage,
          activities: [
            {
              id: `act-${Date.now()}`,
              type: "STAGE",
              description: `Estágio alterado para ${newStage}`,
              createdAt: "Agora",
            },
            ...l.activities,
          ],
        };
      }
      return l;
    });
    setLeads(updated);
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({
        ...selectedLead,
        stage: newStage,
        activities: [
          {
            id: `act-${Date.now()}`,
            type: "STAGE",
            description: `Estágio alterado para ${newStage}`,
            createdAt: "Agora",
          },
          ...selectedLead.activities,
        ],
      });
    }
  };

  // Add Note
  const handleAddNote = () => {
    if (!newNoteInput.trim() || !selectedLead) return;
    const newAct = {
      id: `act-${Date.now()}`,
      type: "NOTE",
      description: newNoteInput,
      createdAt: "Agora",
    };
    const updated = leads.map((l) => {
      if (l.id === selectedLead.id) {
        return {
          ...l,
          activities: [newAct, ...l.activities],
        };
      }
      return l;
    });
    setLeads(updated);
    setSelectedLead({
      ...selectedLead,
      activities: [newAct, ...selectedLead.activities],
    });
    setNewNoteInput("");
  };

  return (
    <main className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* Top Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-surface px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white font-bold tracking-wider text-sm shadow-md shadow-brand-600/20">
            NX
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight">
                NEXORA CRM // OPERAÇÃO COMERCIAL
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MULTI-TENANT ATIVO
              </span>
            </div>
            <p className="text-xs text-foreground/60">Imobiliária Piloto • Jundiaí / SP</p>
          </div>
        </div>

        {/* Commercial Metrics Badges */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5">
            <Users className="h-4 w-4 text-brand-400" />
            <div className="text-xs">
              <span className="text-foreground/60">Total Leads: </span>
              <span className="font-mono font-bold text-foreground">{totalLeads}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
            <Flame className="h-4 w-4 text-amber-400" />
            <div className="text-xs">
              <span className="text-amber-300/80">Quentes: </span>
              <span className="font-mono font-bold text-amber-400">{hotLeads}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5">
            <Bot className="h-4 w-4 text-indigo-400" />
            <div className="text-xs">
              <span className="text-indigo-300/80">IA Ativa: </span>
              <span className="font-mono font-bold text-indigo-400">{aiLeads}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5">
            <Calendar className="h-4 w-4 text-purple-400" />
            <div className="text-xs">
              <span className="text-purple-300/80">Visitas: </span>
              <span className="font-mono font-bold text-purple-400">{visits}</span>
            </div>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-subtle p-1">
          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "kanban"
                ? "bg-surface-elevated text-brand-400 shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" />
            Kanban
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "list"
                ? "bg-surface-elevated text-brand-400 shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </button>
        </div>
      </header>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-subtle px-6 py-2.5">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou interesse..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-surface-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="h-3.5 w-3.5 text-foreground/50" />
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="h-8 rounded-md border border-surface-border bg-surface px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="ALL">Todos os Estágios</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={filterTemp}
              onChange={(e) => setFilterTemp(e.target.value)}
              className="h-8 rounded-md border border-surface-border bg-surface px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="ALL">Todas Temperaturas</option>
              <option value="HOT">🔥 Quente (Hot)</option>
              <option value="WARM">⚡ Morno (Warm)</option>
              <option value="COLD">❄️ Frio (Cold)</option>
            </select>

            <select
              value={filterAuto}
              onChange={(e) => setFilterAuto(e.target.value)}
              className="h-8 rounded-md border border-surface-border bg-surface px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="ALL">Todos os Modos</option>
              <option value="AI">🤖 IA Ativa</option>
              <option value="HUMAN">👤 Humano</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] font-mono text-foreground/50">
          Exibindo <span className="text-foreground font-semibold">{filteredLeads.length}</span>{" "}
          leads
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Kanban or List Container */}
        <div className="flex-1 overflow-auto p-4">
          {viewMode === "kanban" ? (
            <div className="flex gap-3 pb-4 min-w-max">
              {STAGES.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.stage === stage.key);
                return (
                  <div
                    key={stage.key}
                    className="flex w-72 flex-col rounded-xl border border-surface-border bg-surface/50"
                  >
                    <div className="flex items-center justify-between border-b border-surface-border px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${stage.color}`}
                        >
                          {stage.label}
                        </span>
                        <span className="font-mono text-xs text-foreground/50">
                          {stageLeads.length}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-2 p-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                      {stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className={`group relative cursor-pointer rounded-lg border p-3 transition hover:border-brand-500/50 hover:shadow-lg ${
                            selectedLead?.id === lead.id
                              ? "border-brand-500 bg-surface-elevated shadow-md"
                              : "border-surface-border bg-surface hover:bg-surface-subtle"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-xs text-foreground leading-snug">
                              {lead.name}
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                                lead.temperature === "HOT"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : lead.temperature === "WARM"
                                    ? "bg-blue-500/20 text-blue-400"
                                    : "bg-zinc-700/30 text-zinc-400"
                              }`}
                            >
                              {lead.temperature === "HOT"
                                ? "🔥 HOT"
                                : lead.temperature === "WARM"
                                  ? "⚡ WARM"
                                  : "❄️ COLD"}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground/60">
                            <Phone className="h-3 w-3" />
                            <span>{lead.phone}</span>
                          </div>

                          <div className="mt-2 rounded bg-surface-subtle p-1.5 text-[11px] text-foreground/75 line-clamp-2">
                            {lead.lastMessage}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between border-t border-surface-border/50 pt-2 text-[10px]">
                            <div className="flex items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.2 font-mono ${
                                  lead.automationMode === "AI"
                                    ? "bg-indigo-500/20 text-indigo-400"
                                    : "bg-emerald-500/20 text-emerald-400"
                                }`}
                              >
                                {lead.automationMode === "AI" ? "🤖 IA" : "👤 HUMANO"}
                              </span>
                            </div>
                            <span className="font-mono text-foreground/50">
                              {lead.lastMessageAt}
                            </span>
                          </div>
                        </div>
                      ))}

                      {stageLeads.length === 0 && (
                        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-surface-border text-xs text-foreground/40">
                          Sem leads nesta etapa
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-surface-border bg-surface overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-surface-border bg-surface-subtle font-mono text-[11px] text-foreground/70 uppercase">
                  <tr>
                    <th className="p-3">Lead / Contato</th>
                    <th className="p-3">Estágio</th>
                    <th className="p-3">Temperatura</th>
                    <th className="p-3">Interesse / Intenção</th>
                    <th className="p-3">Automação</th>
                    <th className="p-3">Última Mensagem</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`cursor-pointer hover:bg-surface-subtle transition ${
                        selectedLead?.id === lead.id ? "bg-surface-elevated font-medium" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-semibold text-foreground">{lead.name}</div>
                        <div className="text-foreground/50 text-[11px]">{lead.phone}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
                            STAGES.find((s) => s.key === lead.stage)?.color
                          }`}
                        >
                          {STAGES.find((s) => s.key === lead.stage)?.label}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-medium">
                        {lead.temperature === "HOT"
                          ? "🔥 HOT"
                          : lead.temperature === "WARM"
                            ? "⚡ WARM"
                            : "❄️ COLD"}
                      </td>
                      <td className="p-3">{lead.intent}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                            lead.automationMode === "AI"
                              ? "bg-indigo-500/20 text-indigo-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {lead.automationMode === "AI" ? "🤖 IA" : "👤 HUMANO"}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs truncate text-foreground/70">
                        {lead.lastMessage}
                      </td>
                      <td className="p-3 text-right">
                        <ChevronRight className="inline h-4 w-4 text-foreground/40" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Lead 360 Drawer */}
        {selectedLead && (
          <aside className="w-96 shrink-0 border-l border-surface-border bg-surface flex flex-col h-full shadow-2xl">
            {/* Lead 360 Header */}
            <div className="border-b border-surface-border p-4 bg-surface-subtle">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">{selectedLead.name}</h2>
                  <p className="text-xs text-foreground/60 font-mono mt-0.5">
                    {selectedLead.phone}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="rounded-md p-1 text-foreground/40 hover:bg-surface hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Actions Toolbar */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-surface-border/60 pt-3">
                {/* Human Takeover Switch */}
                <button
                  onClick={() => handleToggleTakeover(selectedLead.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                    selectedLead.automationMode === "AI"
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  {selectedLead.automationMode === "AI" ? (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Assumir (Pausar IA)
                    </>
                  ) : (
                    <>
                      <Bot className="h-3.5 w-3.5" />
                      Reativar IA
                    </>
                  )}
                </button>

                {/* Stage Selector */}
                <select
                  value={selectedLead.stage}
                  onChange={(e) => handleChangeStage(selectedLead.id, e.target.value as Stage)}
                  className="h-8 rounded-lg border border-surface-border bg-surface px-2 text-xs font-medium text-foreground focus:outline-none"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-border bg-surface px-2">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition ${
                  activeTab === "chat"
                    ? "border-brand-500 text-brand-400"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Conversa
              </button>
              <button
                onClick={() => setActiveTab("profile")}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition ${
                  activeTab === "profile"
                    ? "border-brand-500 text-brand-400"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Perfil Imobiliário
              </button>
              <button
                onClick={() => setActiveTab("timeline")}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition ${
                  activeTab === "timeline"
                    ? "border-brand-500 text-brand-400"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <ActivityIcon className="h-3.5 w-3.5" />
                Timeline & Notas
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "chat" && (
                <div className="flex flex-col h-full justify-between gap-3">
                  {/* Messages Bubble List */}
                  <div className="space-y-3 overflow-y-auto pr-1">
                    {selectedLead.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.sender === "lead" ? "items-start" : "items-end"}`}
                      >
                        <div className="flex items-center gap-1 text-[10px] text-foreground/50 mb-1">
                          {m.sender === "lead" && <span>Cliente ({selectedLead.name})</span>}
                          {m.sender === "ai" && (
                            <span className="inline-flex items-center gap-1 text-indigo-400">
                              <Bot className="h-3 w-3" /> IA Nexora
                            </span>
                          )}
                          {m.sender === "user" && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <UserCheck className="h-3 w-3" /> Corretor
                            </span>
                          )}
                          <span>• {m.time}</span>
                        </div>
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed max-w-[85%] ${
                            m.sender === "lead"
                              ? "bg-surface-subtle text-foreground border border-surface-border"
                              : m.sender === "ai"
                                ? "bg-indigo-950/40 text-indigo-200 border border-indigo-500/30"
                                : "bg-emerald-950/40 text-emerald-200 border border-emerald-500/30"
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Outbound Input */}
                  <div className="border-t border-surface-border pt-3 mt-auto">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Responder via WhatsApp..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                        className="h-9 flex-1 rounded-lg border border-surface-border bg-surface-subtle px-3 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "profile" && (
                <div className="space-y-4 text-xs">
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground/80">Tipo de Transação:</span>
                      <span className="font-mono font-bold text-brand-400">
                        {selectedLead.profile.transactionType === "RENT" ? "LOCAÇÃO" : "COMPRA"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Tipo do Imóvel:</span>
                      <span className="font-medium text-foreground">
                        {selectedLead.profile.propertyType}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Orçamento Máximo:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        R$ {selectedLead.profile.maxBudget.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Quartos:</span>
                      <span className="font-mono text-foreground">
                        {selectedLead.profile.bedrooms || "A definir"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Vagas de Garagem:</span>
                      <span className="font-mono text-foreground">
                        {selectedLead.profile.parkingSpaces || "A definir"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Aceita Pet:</span>
                      <span className="text-foreground">
                        {selectedLead.profile.hasPet ? "Sim 🐾" : "Não"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Prazo de Mudança:</span>
                      <span className="text-foreground">
                        {selectedLead.profile.moveDate || "Imediato"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Garantia Preferida:</span>
                      <span className="text-foreground">
                        {selectedLead.profile.rentalGuarantee || "A combinar"}
                      </span>
                    </div>
                  </div>

                  {/* Neighborhoods Tags */}
                  <div>
                    <span className="text-[11px] font-semibold text-foreground/70 uppercase font-mono">
                      Bairros de Interesse:
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {selectedLead.profile.neighborhoods.map((nb, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-xs text-brand-300"
                        >
                          {nb}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "timeline" && (
                <div className="space-y-4">
                  {/* Add Note Form */}
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 space-y-2">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-brand-400" />
                      Adicionar Nota Interna
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Escreva uma observação sobre o cliente..."
                      value={newNoteInput}
                      onChange={(e) => setNewNoteInput(e.target.value)}
                      className="w-full rounded-md border border-surface-border bg-surface p-2 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      onClick={handleAddNote}
                      className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-500"
                    >
                      Salvar Nota
                    </button>
                  </div>

                  {/* Activity List */}
                  <div className="space-y-2.5">
                    {selectedLead.activities.map((act) => (
                      <div
                        key={act.id}
                        className="rounded-lg border border-surface-border bg-surface p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-foreground/50 mb-1 font-mono">
                          <span>{act.type}</span>
                          <span>{act.createdAt}</span>
                        </div>
                        <p className="text-foreground/80">{act.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
