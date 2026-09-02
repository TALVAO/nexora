"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Tela de login do corretor. Não há auto-cadastro nesta etapa: contas são
 * provisionadas manualmente para o piloto.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Não foi possível entrar. Confira seu e-mail e senha e tente novamente.");
      setLoading(false);
      return;
    }

    router.push("/inbox");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Entrar no Nexora</h1>
      <p className="mt-1 text-sm text-foreground/60">Área do corretor.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error ? (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
