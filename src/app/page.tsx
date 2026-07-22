import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight text-black dark:text-zinc-50">
            MicroManus
          </h1>
          <p className="mt-2 max-w-md text-lg text-zinc-600 dark:text-zinc-400">
            A deep-research AI agent. Coming soon.
          </p>
        </div>

        <Link
          href={user ? "/dashboard" : "/login"}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {user ? "Go to dashboard" : "Sign in"}
        </Link>
      </main>
    </div>
  );
}
