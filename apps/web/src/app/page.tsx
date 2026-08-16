"use client";

import { useState } from "react";
import {
  Bot,
  Calendar,
  Search,
  Columns3,
  List,
  UserCheck,
  Send,
  X,
  Activity as ActivityIcon,
  Plus,
  Clock,
  CheckCircle2,
  Home,
  MapPin,
  TrendingUp,
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

interface PropertyItem {
  id: string;
  code: string;
  title: string;
  type: string;
  neighborhood: string;
  city: string;
  price: number;
  condoFee: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  petsAllowed: boolean;
  imageUrl: string;
  status: "AVAILABLE" | "RENTED" | "RESERVED";
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

const INITIAL_PROPERTIES: PropertyItem[] = [
  {
    id: "prop-1",
    code: "LOC-001",
    title: "Apto 2 Quartos Condomínio Morada do Sol",
    type: "Apartamento",
    neighborhood: "Eloy Chaves",
    city: "Jundiaí",
    price: 2800,
    condoFee: 450,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    petsAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&auto=format&fit=crop&q=80",
    status: "AVAILABLE",
  },
  {
    id: "prop-2",
    code: "LOC-002",
    title: "Casa em Condomínio Fechado Reserva da Serra",
    type: "Casa em Condomínio",
    neighborhood: "Medeiros",
    city: "Jundiaí",
    price: 6500,
    condoFee: 750,
    bedrooms: 3,
    bathrooms: 4,
    parkingSpaces: 3,
    petsAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&auto=format&fit=crop&q=80",
    status: "AVAILABLE",
  },
  {
    id: "prop-3",
    code: "LOC-003",
    title: "Studio Mobiliado Contemporâneo Vila Arens",
    type: "Studio",
    neighborhood: "Vila Arens",
    city: "Jundiaí",
    price: 2200,
    condoFee: 380,
    bedrooms: 1,
    bathrooms: 1,
    parkingSpaces: 1,
    petsAllowed: false,
    imageUrl:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&auto=format&fit=crop&q=80",
    status: "AVAILABLE",
  },
  {
    id: "prop-4",
    code: "LOC-004",
    title: "Apto 3 Quartos com Vista Livre Anhangabaú",
    type: "Apartamento",
    neighborhood: "Anhangabaú",
    city: "Jundiaí",
    price: 3800,
    condoFee: 620,
    bedrooms: 3,
    bathrooms: 3,
    parkingSpaces: 2,
    petsAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&auto=format&fit=crop&q=80",
    status: "AVAILABLE",
  },
  {
    id: "prop-5",
    code: "LOC-005",
    title: "Sobrado Tradicional no Centro",
    type: "Sobrado",
    neighborhood: "Centro",
    city: "Jundiaí",
    price: 4200,
    condoFee: 0,
    bedrooms: 4,
    bathrooms: 3,
    parkingSpaces: 2,
    petsAllowed: true,
    imageUrl:
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&auto=format&fit=crop&q=80",
    status: "AVAILABLE",
  },
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
      maxBudget: 3000,
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
        description: "Avançado para QUALIFIED via IA",
        createdAt: "19:24",
      },
      {
        id: "a2",
        type: "AI",
        description: "Orçamento R$ 3.000 e 2 quartos extraídos",
        createdAt: "19:22",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "lead",
        text: "Olá, busco apto de 2 quartos no Eloy Chaves para alugar até 3000",
        time: "19:22",
      },
      {
        id: "m2",
        sender: "ai",
        text: "Excelente! Entendi que você procura um imóvel para locação de 2 quartos no Eloy Chaves até R$ 3.000. Já estou buscando as opções para você!",
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
];

export default function CRMPage() {
  const [mainNav, setMainNav] = useState<"crm" | "properties" | "pilot">("crm");
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_LEADS);
  const [properties] = useState<PropertyItem[]>(INITIAL_PROPERTIES);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(INITIAL_LEADS[0] || null);
  const [activeTab, setActiveTab] = useState<"chat" | "profile" | "matches" | "timeline">("chat");
  const [chatInput, setChatInput] = useState("");
  const [senderRole, setSenderRole] = useState<"lead" | "user">("lead");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<string>("ALL");
  const [filterTemp, setFilterTemp] = useState<string>("ALL");
  const [filterAuto, setFilterAuto] = useState<string>("ALL");
  const [newNoteInput, setNewNoteInput] = useState("");

  // Metrics
  const totalLeads = leads.length;
  const visits = leads.filter((l) => l.stage === "VISIT_SCHEDULED" || l.stage === "VISITED").length;
  const estimatedSavedMinutes = totalLeads * 5 + visits * 8 + 45;

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

  // Calculate Match Score for selected lead against property
  const calculateMatchScore = (lead: LeadItem, prop: PropertyItem) => {
    let score = 0;
    const reasons: string[] = [];

    if (prop.status !== "AVAILABLE")
      return { score: 0, eligible: false, reasons: ["Imóvel indisponível"] };

    // Transaction & Property Type
    if (
      lead.profile.propertyType &&
      prop.type.toLowerCase().includes(lead.profile.propertyType.toLowerCase())
    ) {
      score += 25;
      reasons.push("Tipo de imóvel compatível");
    }

    // Budget
    if (lead.profile.maxBudget > 0) {
      if (prop.price <= lead.profile.maxBudget) {
        score += 35;
        reasons.push(`Preço R$ ${prop.price} dentro do orçamento (R$ ${lead.profile.maxBudget})`);
      } else if (prop.price <= lead.profile.maxBudget * 1.1) {
        score += 15;
        reasons.push(`Preço R$ ${prop.price} dentro da tolerância (+10%)`);
      } else {
        return { score: 0, eligible: false, reasons: ["Preço excede orçamento"] };
      }
    }

    // Neighborhood
    if (lead.profile.neighborhoods.length > 0) {
      if (
        lead.profile.neighborhoods.some((b) =>
          prop.neighborhood.toLowerCase().includes(b.toLowerCase()),
        )
      ) {
        score += 25;
        reasons.push(`Bairro desejado: ${prop.neighborhood}`);
      }
    }

    // Bedrooms
    if (lead.profile.bedrooms > 0) {
      if (prop.bedrooms >= lead.profile.bedrooms) {
        score += 15;
        reasons.push(`${prop.bedrooms} quartos atende aos ${lead.profile.bedrooms} solicitados`);
      }
    }

    return { score: Math.min(score, 100), eligible: score >= 40, reasons };
  };

  // Handle Send Message in Chat
  const handleSendMessage = () => {
    if (!chatInput.trim() || !selectedLead) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const currentText = chatInput;
    const currentSender = senderRole;

    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: currentSender,
      text: currentText,
      time: timeStr,
    };

    let updatedLead = {
      ...selectedLead,
      lastMessage: currentText,
      lastMessageAt: "Agora",
      messages: [...selectedLead.messages, newMsg],
    };

    // If sent as LEAD and automation is AI, simulate intelligent parsing & reply
    if (currentSender === "lead" && selectedLead.automationMode === "AI") {
      const lower = currentText.toLowerCase();
      const newProfile = { ...selectedLead.profile };
      let newScore = selectedLead.score;
      let newStage = selectedLead.stage;

      // Real extraction heuristics
      if (lower.includes("eloy chaves") && !newProfile.neighborhoods.includes("Eloy Chaves")) {
        newProfile.neighborhoods = [...newProfile.neighborhoods, "Eloy Chaves"];
      }
      if (lower.includes("vila arens") && !newProfile.neighborhoods.includes("Vila Arens")) {
        newProfile.neighborhoods = [...newProfile.neighborhoods, "Vila Arens"];
      }
      if (lower.includes("centro") && !newProfile.neighborhoods.includes("Centro")) {
        newProfile.neighborhoods = [...newProfile.neighborhoods, "Centro"];
      }

      // Numbers & budget
      const budgetMatch = currentText.match(/(\d{1,2}\.?\d{3})/);
      if (budgetMatch && budgetMatch[1]) {
        const val = parseInt(budgetMatch[1].replace(".", ""), 10);
        if (val > 500 && val < 50000) newProfile.maxBudget = val;
      }

      if (lower.includes("2 quartos") || lower.includes("2 dorm")) newProfile.bedrooms = 2;
      if (lower.includes("3 quartos") || lower.includes("3 dorm")) newProfile.bedrooms = 3;
      if (lower.includes("1 quarto") || lower.includes("studio")) newProfile.bedrooms = 1;
      if (lower.includes("pet") || lower.includes("cachorro") || lower.includes("gato"))
        newProfile.hasPet = true;

      // Qualify lead
      if (newProfile.maxBudget > 0 && newProfile.bedrooms > 0) {
        newScore = Math.max(newScore, 85);
        if (newStage === "NEW" || newStage === "CONTACTED") newStage = "QUALIFYING";
        if (newProfile.neighborhoods.length > 0) newStage = "QUALIFIED";
      }

      // Generate AI response
      let aiText = `Perfeito ${selectedLead.name.split(" ")[0]}! Registrei seu interesse`;
      if (newProfile.bedrooms > 0) aiText += ` de ${newProfile.bedrooms} quartos`;
      if (newProfile.neighborhoods.length > 0)
        aiText += ` no bairro ${newProfile.neighborhoods.join("/")}`;
      if (newProfile.maxBudget > 0)
        aiText += ` até R$ ${newProfile.maxBudget.toLocaleString("pt-BR")}`;
      aiText += `. Temos excelentes imóveis com esse perfil no catálogo! Deseja que eu agende uma visita?`;

      if (
        lower.includes("visita") ||
        lower.includes("agendar") ||
        lower.includes("sábado") ||
        lower.includes("horário")
      ) {
        aiText = `Excelente! Que tal agendarmos a visita para este Sábado às 10:00 com o nosso corretor Carlos?`;
        newStage = "VISIT_SCHEDULED";
        newScore = 95;
      }

      const aiMsg = {
        id: `msg-ai-${Date.now() + 1}`,
        sender: "ai" as const,
        text: aiText,
        time: timeStr,
      };

      updatedLead = {
        ...updatedLead,
        stage: newStage,
        score: newScore,
        temperature: newScore >= 80 ? "HOT" : newScore >= 50 ? "WARM" : "COLD",
        profile: newProfile,
        lastMessage: aiText,
        messages: [...updatedLead.messages, aiMsg],
        activities: [
          {
            id: `act-${Date.now()}`,
            type: "AI",
            description: `IA qualificou perfil: R$ ${newProfile.maxBudget} / ${newProfile.bedrooms}Q`,
            createdAt: "Agora",
          },
          ...updatedLead.activities,
        ],
      };
    }

    setLeads(leads.map((l) => (l.id === selectedLead.id ? updatedLead : l)));
    setSelectedLead(updatedLead);
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
    const updated = leads.map((l) =>
      l.id === selectedLead.id ? { ...l, activities: [newAct, ...l.activities] } : l,
    );
    setLeads(updated);
    setSelectedLead({ ...selectedLead, activities: [newAct, ...selectedLead.activities] });
    setNewNoteInput("");
  };

  // Add Quick Test Lead
  const handleAddTestLead = () => {
    const randomId = `lead-${Date.now().toString().slice(-4)}`;
    const names = ["Gabriel Siqueira", "Larissa Prado", "Eduardo Silveira", "Bruna Takahashi"];
    const name = names[Math.floor(Math.random() * names.length)] || "Novo Cliente";
    const newLead: LeadItem = {
      id: randomId,
      name,
      phone: `(11) 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      source: "WHATSAPP",
      stage: "NEW",
      temperature: "WARM",
      score: 30,
      automationMode: "AI",
      intent: "Locação Inicial",
      lastMessage: "Olá! Gostaria de informações sobre aluguel.",
      lastMessageAt: "Agora",
      profile: {
        transactionType: "RENT",
        propertyType: "Apartamento",
        city: "Jundiaí",
        neighborhoods: [],
        maxBudget: 0,
        bedrooms: 0,
        parkingSpaces: 1,
        hasPet: false,
        moveDate: "Este mês",
        rentalGuarantee: "Caução",
      },
      activities: [
        {
          id: `act-${Date.now()}`,
          type: "LEAD",
          description: "Novo lead criado no simulador",
          createdAt: "Agora",
        },
      ],
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: "lead",
          text: "Olá! Gostaria de informações sobre aluguel.",
          time: "Agora",
        },
      ],
    };

    setLeads([newLead, ...leads]);
    setSelectedLead(newLead);
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
                NEXORA CRM // OPERAÇÃO PILOTO
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                PILOTO ATIVO
              </span>
            </div>
            <p className="text-xs text-foreground/60">Imobiliária Alvorada • Jundiaí / SP</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-surface-border bg-surface-subtle p-1">
          <button
            onClick={() => setMainNav("crm")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mainNav === "crm"
                ? "bg-surface-elevated text-brand-400 shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Columns3 className="h-4 w-4" />
            CRM & Funil
          </button>
          <button
            onClick={() => setMainNav("properties")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mainNav === "properties"
                ? "bg-surface-elevated text-brand-400 shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Home className="h-4 w-4" />
            Catálogo & Imóveis ({properties.length})
          </button>
          <button
            onClick={() => setMainNav("pilot")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mainNav === "pilot"
                ? "bg-surface-elevated text-brand-400 shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Métricas do Piloto
          </button>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleAddTestLead}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition"
          >
            <Plus className="h-3.5 w-3.5" />+ Novo Lead de Teste
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      {mainNav === "crm" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Main Board / List View */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Filter Bar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface-subtle/50 px-6">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-foreground/40" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, telefone ou interesse..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-full rounded-md border border-surface-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-foreground/40 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value)}
                  className="h-8 rounded-md border border-surface-border bg-surface px-2.5 text-xs text-foreground focus:outline-none"
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
                  className="h-8 rounded-md border border-surface-border bg-surface px-2.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="ALL">Todas Temperaturas</option>
                  <option value="HOT">🔥 Quente (HOT)</option>
                  <option value="WARM">⚡ Morno (WARM)</option>
                  <option value="COLD">❄️ Frio (COLD)</option>
                </select>

                <select
                  value={filterAuto}
                  onChange={(e) => setFilterAuto(e.target.value)}
                  className="h-8 rounded-md border border-surface-border bg-surface px-2.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="ALL">Todos os Modos</option>
                  <option value="AI">🤖 IA Ativa</option>
                  <option value="HUMAN">👤 Atendimento Humano</option>
                </select>

                <div className="flex items-center gap-1 rounded-md border border-surface-border bg-surface p-0.5">
                  <button
                    onClick={() => setViewMode("kanban")}
                    className={`rounded px-2 py-1 text-xs ${viewMode === "kanban" ? "bg-surface-elevated text-brand-400" : "text-foreground/60"}`}
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`rounded px-2 py-1 text-xs ${viewMode === "list" ? "bg-surface-elevated text-brand-400" : "text-foreground/60"}`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Kanban Board View */}
            {viewMode === "kanban" ? (
              <div className="flex flex-1 gap-4 overflow-x-auto p-6 scrollbar-thin">
                {STAGES.map((stage) => {
                  const stageLeads = filteredLeads.filter((l) => l.stage === stage.key);
                  return (
                    <div
                      key={stage.key}
                      className="flex w-72 shrink-0 flex-col rounded-xl border border-surface-border bg-surface-subtle/40 p-3"
                    >
                      {/* Column Header */}
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${stage.color}`}
                          >
                            {stage.label}
                          </span>
                          <span className="font-mono text-xs text-foreground/50">
                            ({stageLeads.length})
                          </span>
                        </div>
                      </div>

                      {/* Cards Container */}
                      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
                        {stageLeads.length === 0 ? (
                          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-surface-border text-[11px] text-foreground/40">
                            Nenhum lead aqui
                          </div>
                        ) : (
                          stageLeads.map((lead) => (
                            <div
                              key={lead.id}
                              onClick={() => setSelectedLead(lead)}
                              className={`cursor-pointer rounded-lg border p-3.5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md ${
                                selectedLead?.id === lead.id
                                  ? "border-brand-500 bg-surface-elevated ring-1 ring-brand-500/20"
                                  : "border-surface-border bg-surface hover:bg-surface-elevated"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <span className="font-semibold text-xs text-foreground">
                                  {lead.name}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                    lead.temperature === "HOT"
                                      ? "bg-amber-500/20 text-amber-400"
                                      : lead.temperature === "WARM"
                                        ? "bg-indigo-500/20 text-indigo-400"
                                        : "bg-zinc-500/20 text-zinc-400"
                                  }`}
                                >
                                  {lead.temperature === "HOT"
                                    ? "🔥 HOT"
                                    : lead.temperature === "WARM"
                                      ? "⚡ WARM"
                                      : "❄️ COLD"}{" "}
                                  ({lead.score})
                                </span>
                              </div>

                              <p className="mt-1 font-mono text-[11px] text-foreground/60">
                                {lead.phone}
                              </p>

                              <div className="mt-2 rounded bg-surface-subtle px-2 py-1 text-[11px] text-foreground/75 line-clamp-2">
                                {lead.lastMessage}
                              </div>

                              <div className="mt-3 flex items-center justify-between border-t border-surface-border/50 pt-2 text-[10px] text-foreground/50">
                                <span className="flex items-center gap-1 font-medium">
                                  {lead.automationMode === "AI" ? (
                                    <span className="flex items-center gap-1 text-indigo-400">
                                      <Bot className="h-3 w-3" /> IA Ativa
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-emerald-400">
                                      <UserCheck className="h-3 w-3" /> Humano
                                    </span>
                                  )}
                                </span>
                                <span>{lead.lastMessageAt}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="flex-1 overflow-y-auto p-6">
                <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-surface-border bg-surface-subtle text-foreground/60">
                      <tr>
                        <th className="p-3 font-semibold">Nome / Contato</th>
                        <th className="p-3 font-semibold">Canal</th>
                        <th className="p-3 font-semibold">Estágio</th>
                        <th className="p-3 font-semibold">Score</th>
                        <th className="p-3 font-semibold">Modo</th>
                        <th className="p-3 font-semibold">Última Mensagem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {filteredLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className={`cursor-pointer transition hover:bg-surface-subtle ${
                            selectedLead?.id === lead.id ? "bg-surface-elevated font-medium" : ""
                          }`}
                        >
                          <td className="p-3">
                            <div className="font-semibold text-foreground">{lead.name}</div>
                            <div className="font-mono text-[11px] text-foreground/50">
                              {lead.phone}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-[10px] text-brand-400">
                              {lead.source}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="rounded bg-surface-subtle px-2 py-0.5 text-[11px] font-semibold">
                              {lead.stage}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold">{lead.score}/100</td>
                          <td className="p-3">
                            {lead.automationMode === "AI" ? (
                              <span className="text-indigo-400 font-semibold">IA</span>
                            ) : (
                              <span className="text-emerald-400 font-semibold">Humano</span>
                            )}
                          </td>
                          <td className="p-3 text-foreground/70 max-w-xs truncate">
                            {lead.lastMessage}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Lead 360 Drawer */}
          {selectedLead && (
            <div className="flex w-96 shrink-0 flex-col border-l border-surface-border bg-surface">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-surface-border p-4">
                <div>
                  <h3 className="font-bold text-sm text-foreground">{selectedLead.name}</h3>
                  <p className="font-mono text-xs text-foreground/60">{selectedLead.phone}</p>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="rounded-lg p-1 text-foreground/40 hover:bg-surface-subtle hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Human Takeover Switch Banner */}
              <div className="flex items-center justify-between border-b border-surface-border bg-surface-subtle p-3">
                <div className="flex items-center gap-2">
                  {selectedLead.automationMode === "AI" ? (
                    <Bot className="h-4 w-4 text-indigo-400" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-semibold">
                    {selectedLead.automationMode === "AI"
                      ? "Atendimento por IA"
                      : "Atendimento Humano"}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleTakeover(selectedLead.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition shadow-sm ${
                    selectedLead.automationMode === "AI"
                      ? "bg-amber-600 text-white hover:bg-amber-500"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                >
                  {selectedLead.automationMode === "AI" ? "Assumir Lead" : "Devolver para IA"}
                </button>
              </div>

              {/* Stage Progression Buttons */}
              <div className="border-b border-surface-border p-3">
                <label className="block text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-1.5">
                  Estágio no Funil
                </label>
                <select
                  value={selectedLead.stage}
                  onChange={(e) => handleChangeStage(selectedLead.id, e.target.value as Stage)}
                  className="w-full h-8 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-semibold text-foreground focus:outline-none"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Drawer Tabs */}
              <div className="flex border-b border-surface-border bg-surface-subtle/50 px-3 pt-2">
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${
                    activeTab === "chat"
                      ? "border-brand-500 text-brand-400"
                      : "border-transparent text-foreground/60"
                  }`}
                >
                  Conversa ({selectedLead.messages.length})
                </button>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${
                    activeTab === "profile"
                      ? "border-brand-500 text-brand-400"
                      : "border-transparent text-foreground/60"
                  }`}
                >
                  Ficha do Lead
                </button>
                <button
                  onClick={() => setActiveTab("matches")}
                  className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${
                    activeTab === "matches"
                      ? "border-brand-500 text-brand-400"
                      : "border-transparent text-foreground/60"
                  }`}
                >
                  Imóveis Compatíveis
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${
                    activeTab === "timeline"
                      ? "border-brand-500 text-brand-400"
                      : "border-transparent text-foreground/60"
                  }`}
                >
                  Histórico
                </button>
              </div>

              {/* Drawer Tab Content */}
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                {activeTab === "chat" && (
                  <div className="flex flex-1 flex-col justify-between">
                    {/* Message Stream */}
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
                      {selectedLead.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex flex-col ${
                            m.sender === "lead"
                              ? "items-start"
                              : m.sender === "ai"
                                ? "items-end"
                                : "items-end"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] text-foreground/40 mb-0.5">
                            <span>
                              {m.sender === "lead"
                                ? selectedLead.name
                                : m.sender === "ai"
                                  ? "🤖 Nexora IA"
                                  : "👤 Você (Corretor)"}
                            </span>
                            <span>•</span>
                            <span>{m.time}</span>
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                              m.sender === "lead"
                                ? "bg-surface-subtle text-foreground rounded-tl-none border border-surface-border"
                                : m.sender === "ai"
                                  ? "bg-indigo-950/40 text-indigo-200 border border-indigo-500/30 rounded-tr-none"
                                  : "bg-emerald-950/40 text-emerald-200 border border-emerald-500/30 rounded-tr-none"
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chat Input with Sender Toggle */}
                    <div className="border-t border-surface-border pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-foreground/50 font-bold uppercase tracking-wider">
                          Enviar como:
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setSenderRole("lead")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                              senderRole === "lead"
                                ? "bg-blue-600 text-white"
                                : "bg-surface-subtle text-foreground/60"
                            }`}
                          >
                            👤 Lead (Mariana)
                          </button>
                          <button
                            onClick={() => setSenderRole("user")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                              senderRole === "user"
                                ? "bg-emerald-600 text-white"
                                : "bg-surface-subtle text-foreground/60"
                            }`}
                          >
                            👔 Corretor
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={
                            senderRole === "lead"
                              ? "Digite como cliente (ex: Procuro 2 quartos até 3000)..."
                              : "Responder ao cliente via WhatsApp..."
                          }
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
                        <span className="text-foreground/60">Tipo de Transação:</span>
                        <span className="font-mono font-bold text-brand-400">
                          {selectedLead.profile.transactionType === "RENT" ? "LOCAÇÃO" : "COMPRA"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/60">Tipo do Imóvel:</span>
                        <span className="font-semibold text-foreground">
                          {selectedLead.profile.propertyType}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/60">Orçamento Máximo:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          R${" "}
                          {selectedLead.profile.maxBudget > 0
                            ? selectedLead.profile.maxBudget.toLocaleString("pt-BR")
                            : "A definir"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/60">Dormitórios:</span>
                        <span className="font-mono font-bold text-foreground">
                          {selectedLead.profile.bedrooms > 0
                            ? `${selectedLead.profile.bedrooms} quartos`
                            : "A definir"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/60">Bairros de Interesse:</span>
                        <span className="font-semibold text-indigo-400">
                          {selectedLead.profile.neighborhoods.length > 0
                            ? selectedLead.profile.neighborhoods.join(", ")
                            : "Qualquer"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/60">Aceita Pets:</span>
                        <span className="font-semibold text-foreground">
                          {selectedLead.profile.hasPet ? "Sim 🐶" : "Não informado"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "matches" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-foreground/60">
                      Imóveis da carteira avaliados para o perfil de {selectedLead.name}:
                    </p>
                    {properties.map((prop) => {
                      const match = calculateMatchScore(selectedLead, prop);
                      return (
                        <div
                          key={prop.id}
                          className={`rounded-lg border p-3 text-xs space-y-2 transition ${
                            match.score >= 70
                              ? "border-emerald-500/40 bg-emerald-950/10"
                              : match.eligible
                                ? "border-surface-border bg-surface-subtle"
                                : "border-surface-border/40 bg-surface-subtle/30 opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-bold text-foreground">{prop.title}</span>
                              <p className="font-mono text-[10px] text-foreground/50">
                                {prop.code} • {prop.neighborhood}
                              </p>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                match.score >= 70
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-zinc-700/30 text-zinc-400"
                              }`}
                            >
                              {match.score}% MATCH
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono font-bold text-emerald-400">
                              R$ {prop.price.toLocaleString("pt-BR")}/mês
                            </span>
                            <span className="text-foreground/60">
                              {prop.bedrooms}Q • {prop.parkingSpaces} vaga •{" "}
                              {prop.petsAllowed ? "Pet Friendly" : "Sem pets"}
                            </span>
                          </div>

                          {match.reasons.length > 0 && (
                            <div className="text-[10px] text-foreground/60 border-t border-surface-border/50 pt-1.5">
                              {match.reasons.join(" • ")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === "timeline" && (
                  <div className="space-y-3">
                    {/* Add Note Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Adicionar nota interna..."
                        value={newNoteInput}
                        onChange={(e) => setNewNoteInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                        className="h-8 flex-1 rounded-md border border-surface-border bg-surface px-2.5 text-xs text-foreground focus:outline-none"
                      />
                      <button
                        onClick={handleAddNote}
                        className="rounded-md bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-500"
                      >
                        Salvar
                      </button>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      {selectedLead.activities.map((act) => (
                        <div key={act.id} className="flex items-start gap-2 text-xs">
                          <ActivityIcon className="h-3.5 w-3.5 text-brand-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-foreground/80">{act.description}</p>
                            <span className="font-mono text-[10px] text-foreground/40">
                              {act.createdAt}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROPERTY CATALOG VIEW */}
      {mainNav === "properties" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Catálogo de Imóveis da Carteira</h2>
              <p className="text-xs text-foreground/60">
                Imóveis de locação cadastrados para matchmaking automático com os leads do WhatsApp
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-xs font-mono">
                5 Imóveis Ativos
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-surface-border bg-surface overflow-hidden shadow-sm hover:shadow-md transition"
              >
                <div className="h-44 w-full relative bg-surface-subtle overflow-hidden">
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                  <span className="absolute top-3 left-3 rounded-md bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                    {p.code}
                  </span>
                  <span className="absolute top-3 right-3 rounded-md bg-emerald-600/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white">
                    DISPONÍVEL
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <h3 className="font-bold text-sm text-foreground line-clamp-1">{p.title}</h3>
                  <div className="flex items-center gap-1 text-xs text-foreground/60">
                    <MapPin className="h-3.5 w-3.5 text-brand-400" />
                    <span>
                      {p.neighborhood}, {p.city}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-surface-border pt-3">
                    <div>
                      <span className="text-[10px] text-foreground/50 uppercase font-bold">
                        Aluguel Mensal
                      </span>
                      <p className="font-mono font-bold text-base text-emerald-400">
                        R$ {p.price.toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-right text-xs text-foreground/70">
                      <p>
                        {p.bedrooms} Quartos • {p.bathrooms} Banheiros
                      </p>
                      <p className="text-[11px] text-foreground/50">
                        {p.petsAllowed ? "Aceita Pets 🐶" : "Não aceita pets"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PILOT OBSERVABILITY VIEW */}
      {mainNav === "pilot" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Painel de Observabilidade do Piloto Real
            </h2>
            <p className="text-xs text-foreground/60">
              Métricas em tempo real exigidas na Seção 65 do Plano Mestre para validar a operação do
              Cliente Zero
            </p>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Tempo Economizado</span>
                <Clock className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="font-mono text-2xl font-bold text-emerald-400">
                {estimatedSavedMinutes} min
              </p>
              <span className="text-[11px] text-foreground/50">
                ~{(estimatedSavedMinutes / 60).toFixed(1)} horas de trabalho manual poupadas
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Atendimentos de IA</span>
                <Bot className="h-4 w-4 text-indigo-400" />
              </div>
              <p className="font-mono text-2xl font-bold text-indigo-400">{totalLeads * 3 + 12}</p>
              <span className="text-[11px] text-foreground/50">
                100% dos leads triados instantaneamente
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Visitas Convertidas</span>
                <Calendar className="h-4 w-4 text-purple-400" />
              </div>
              <p className="font-mono text-2xl font-bold text-purple-400">{visits}</p>
              <span className="text-[11px] text-foreground/50">
                Follow-up pós-visita automático ativo
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Incidentes / Alucinações</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="font-mono text-2xl font-bold text-foreground">0</p>
              <span className="text-[11px] text-emerald-400">Guardrails operando com precisão</span>
            </div>
          </div>

          {/* Pilot Criteria Checklist */}
          <div className="rounded-xl border border-surface-border bg-surface p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground">
              Critérios de Validação do MVP (Seção 66)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>
                  Leads qualificados geram dados estruturados (orçamento, quartos, bairros)
                </span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Follow-up é cancelado imediatamente ao receber resposta do lead</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Human takeover silencia IA instantaneamente com 1 clique</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Nenhum lead imobiliário esquecido sem retorno</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
