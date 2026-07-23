import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Welcome to MicroManus
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Signed in as {user.email}
        </p>
        <div className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium dark:border-white/[.145]">
          {credits.balance} credit{credits.balance === 1 ? "" : "s"} remaining
        </div>
        <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-500">
          1 credit = 1 research run (a chat message that gets a full answer). Check
          "Cost & stats" for the actual $ spent on tokens, which is separate from your credits.
        </p>

        {!isConnected && (
          <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-300">
              You haven&apos;t connected a model yet — chatting won&apos;t work until you do.
            </p>
            <Link
              href="/settings"
              className="font-medium text-amber-900 underline underline-offset-4 dark:text-amber-200"
            >
              Connect your API key
            </Link>
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/chat"
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Open chat
          </Link>
          <Link
            href="/settings"
            className="rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            LLM connection settings
          </Link>
          <Link
            href="/stats"
            className="rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Cost & stats
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
