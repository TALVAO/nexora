import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton do cliente Supabase no browser. Criar mais de uma instância por
 * módulo duplicaria listeners internos de auth sem necessidade.
 */
let browserClient: SupabaseClient | undefined;

/**
 * Retorna o cliente Supabase para uso em client components.
 *
 * Diferente do backend (`resolveJwtSecret` em `apps/api/src/plugins/auth.ts`),
 * que cai para um segredo de desenvolvimento fora de produção, aqui não há
 * modo "sem Supabase": o frontend depende do Supabase Auth para qualquer
 * navegação autenticada, então uma variável ausente ou com valor placeholder
 * é um erro fatal, não um aviso.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.startsWith("placeholder") || anonKey.startsWith("placeholder")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes ou com valor placeholder. " +
        "Configure as variáveis de ambiente do Supabase com valores reais antes de rodar o frontend.",
    );
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
