"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Columns3, Home, Inbox, LogOut, Settings } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Inbox;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/funil", label: "Funil", icon: Columns3 },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/imoveis", label: "Imóveis", icon: Home },
  { href: "/config", label: "Config", icon: Settings },
];

/**
 * Um item é considerado ativo por comparação de prefixo (não só igualdade),
 * para que rotas de detalhe dentro de um destino (ex.: /inbox/algo) também
 * destaquem a aba correspondente. Rotas fora dos cinco destinos (ex.:
 * /lead/algumId) não têm prefixo correspondente aqui, então nenhuma aba
 * acende para elas — comportamento esperado, não um caso especial.
 */
function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

async function handleSignOut(router: ReturnType<typeof useRouter>) {
  await getSupabaseBrowserClient().auth.signOut();
  router.push("/login");
  router.refresh();
}

/**
 * Casca do app autenticado: barra lateral em telas médias/grandes, barra de
 * abas fixa no rodapé em telas pequenas. O corretor usa isso no celular boa
 * parte do tempo, então a navegação mobile é a prioridade, não um encaixe da
 * versão desktop.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-surface-border bg-surface md:flex">
        <div className="px-6 py-6 text-lg font-semibold text-foreground">Nexora</div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-600"
                    : "text-foreground/60 hover:bg-surface-subtle hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-surface-border p-3">
          <button
            type="button"
            onClick={() => void handleSignOut(router)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-surface-subtle hover:text-foreground"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      <main className="pb-20 md:ml-64 md:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-5 border-t border-surface-border bg-surface md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-medium ${
                active ? "text-brand-600" : "text-foreground/60"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
