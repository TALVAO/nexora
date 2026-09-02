import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export interface UpdateSupabaseSessionResult {
  response: NextResponse;
  user: User | null;
}

/**
 * Atualiza (refresca) a sessão do Supabase a partir dos cookies da requisição
 * e devolve tanto a resposta com os cookies renovados quanto o usuário
 * autenticado (ou null).
 *
 * Segue o padrão oficial do Supabase SSR para middleware: depois de qualquer
 * `setAll`, a variável de resposta é recriada com `NextResponse.next({ request })`
 * e os cookies são reaplicados nela — é assim que os cookies atualizados
 * propagam tanto para a requisição atual quanto para a resposta ao browser.
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<UpdateSupabaseSessionResult> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Middleware roda em toda requisição, inclusive antes de qualquer setup de
  // ambiente estar completo — diferente do client.ts, aqui não lançamos: uma
  // falha aqui derrubaria a aplicação inteira, não só uma chamada de API.
  if (!url || !anonKey || url.startsWith("placeholder") || anonKey.startsWith("placeholder")) {
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes ou com valor placeholder. " +
        "Middleware seguirá sem validar sessão de usuário.",
    );
    return { response, user: null };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida o token contra o servidor do Supabase; getSession() só
  // leria o cookie local, sem confirmar que ainda é válido.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
