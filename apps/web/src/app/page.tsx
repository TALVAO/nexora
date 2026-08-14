import { Activity, ShieldCheck, Zap, Bot, MessageSquare } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12">
      <div className="w-full max-w-4xl space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-subtle px-3 py-1 text-xs font-mono text-foreground/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            NEXORA // PLATAFORMA IMOBILIÁRIA ATIVA
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
            Nenhum lead imobiliário deve ser esquecido.
          </h1>
          <p className="text-base text-foreground/70 md:text-lg max-w-2xl">
            Sistema operacional comercial com IA, mensageria unificada, CRM conversacional e motor
            de follow-up inteligente para corretores e imobiliárias.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-surface-border bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-500 font-semibold text-sm">
              <MessageSquare className="h-4 w-4" />
              <span>Omnichannel Gateway</span>
            </div>
            <p className="text-xs text-foreground/70">
              Captura e normalização unificada para WhatsApp e Instagram com idempotência rigorosa.
            </p>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-500 font-semibold text-sm">
              <Bot className="h-4 w-4" />
              <span>Conversation Engine</span>
            </div>
            <p className="text-xs text-foreground/70">
              Qualificação em 4 etapas especializadas, lead scoring híbrido e handoff humano seguro.
            </p>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-500 font-semibold text-sm">
              <Zap className="h-4 w-4" />
              <span>Follow-up Engine</span>
            </div>
            <p className="text-xs text-foreground/70">
              Gatilhos contextuais, stop conditions invioláveis e recuperação ativa de leads.
            </p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-surface-border pt-6 text-xs text-foreground/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Fundação Multi-tenant &amp; RLS Pronta</span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <Activity className="h-4 w-4 text-brand-500" />
            <span>ETAPA 0 // REPOSITÓRIO E FUNDAÇÃO</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
