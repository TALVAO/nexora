"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSubscription } from "@/lib/api";

const PLAN_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  TEAM: "Equipe",
  BUSINESS: "Negócios",
};

export default function ConfigPage() {
  const router = useRouter();

  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await getSupabaseBrowserClient().auth.getUser();
      return user;
    },
  });

  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
  });

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const subscription = subscriptionQuery.data;
  const planLabel = subscription ? (PLAN_LABELS[subscription.plan] ?? subscription.plan) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
      <p className="mt-1 text-sm text-foreground/60">Sua conta e assinatura.</p>

      <div className="mt-6 space-y-4 rounded-2xl border border-surface-border bg-surface p-6">
        <div>
          <p className="text-xs text-foreground/60">E-mail</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {userQuery.data?.email ?? "Carregando..."}
          </p>
        </div>

        <div>
          <p className="text-xs text-foreground/60">Plano atual</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {planLabel ?? "Carregando..."}
          </p>
        </div>

        <div>
          <p className="text-xs text-foreground/60">Uso no mês</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {subscription
              ? `${subscription.usage.leadsThisMonth} de ${subscription.limits.maxLeadsPerMonth} leads`
              : "Carregando..."}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </button>
    </div>
  );
}
