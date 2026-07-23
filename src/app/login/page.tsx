"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Provider = "github" | "google";

function LoginForm() {
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  async function signIn(provider: Provider) {
    setError(null);
    setLoading(provider);
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/dashboard";

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  return (
    <main className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-black/[.08] bg-white p-6 text-center dark:border-white/[.145] dark:bg-zinc-950">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Sign in to MicroManus
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          No passwords — just your GitHub or Google account.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <button
          onClick={() => signIn("github")}
          disabled={loading !== null}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
        </button>
        <button
          onClick={() => signIn("google")}
          disabled={loading !== null}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          {loading === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </main>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
