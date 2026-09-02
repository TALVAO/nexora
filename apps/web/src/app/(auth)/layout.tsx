import { Building2 } from "lucide-react";

/**
 * Layout do grupo de rotas de autenticação: tela cheia centralizada com um
 * cartão único para o conteúdo da página (login, e futuramente outras telas
 * de auth provisionadas manualmente para o piloto).
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-foreground">
          <Building2 className="h-6 w-6 text-brand-600" aria-hidden="true" />
          <span className="text-lg font-semibold">Nexora</span>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
