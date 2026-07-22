import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
        <div className="flex gap-3">
          <Link
            href="/settings"
            className="rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            LLM connection settings
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
