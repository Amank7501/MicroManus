import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NAV_LINKS = [
  { href: "/chat", icon: "💬", label: "Open chat", description: "Start or continue a research thread" },
  { href: "/settings", icon: "🔌", label: "LLM connection", description: "Manage your API key and model" },
  { href: "/stats", icon: "📊", label: "Cost & stats", description: "Token usage and $ spend per chat" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!credits) {
    redirect("/paywall");
  }

  const admin = createAdminClient();
  const { data: apiKey } = await admin
    .from("api_keys")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  const isConnected = apiKey?.status === "connected";

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Welcome back
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
          </div>
          <span className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium dark:border-white/[.145]">
            {credits.balance} credit{credits.balance === 1 ? "" : "s"}
          </span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
          1 credit = 1 research run (a chat message that gets a full answer). Actual $ cost from
          tokens is tracked separately — see Cost &amp; stats below.
        </p>

        {!isConnected && (
          <div className="mt-4 flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-300">
              You haven&apos;t connected a model yet — chatting won&apos;t work until you do.
            </p>
            <Link
              href="/settings"
              className="font-medium text-amber-900 underline underline-offset-4 dark:text-amber-200"
            >
              Connect your API key →
            </Link>
          </div>
        )}

        <nav className="mt-5 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[.05] text-base dark:bg-white/[.08]"
              >
                {link.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-black dark:text-zinc-50">
                  {link.label}
                </span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {link.description}
                </span>
              </span>
              <span aria-hidden className="text-zinc-400 dark:text-zinc-600">
                →
              </span>
            </Link>
          ))}
        </nav>

        <form action="/auth/signout" method="post" className="mt-5 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
          <button
            type="submit"
            className="text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
