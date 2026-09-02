"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Provider de React Query para a árvore de client components autenticados.
 *
 * O `QueryClient` é criado uma única vez via `useState` (não a cada render).
 * `staleTime` de 30s é razoável para dados de CRM: mudam, mas não precisam
 * ser realtime nesta etapa.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
