import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SettingsForm from "./settings-form";

export default async function SettingsPage() {
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
  const { data: existing } = await admin
    .from("api_keys")
    .select("provider, endpoint, selected_model, status")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            LLM connection
          </h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
          >
            Back to dashboard
          </Link>
        </div>
        <p className="-mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Bring your own OpenAI-compatible API key. It&apos;s encrypted and stored server-side —
          never sent to the browser.
        </p>

        <SettingsForm
          initialProvider={existing?.provider ?? null}
          initialEndpoint={existing?.endpoint ?? null}
          initialModel={existing?.selected_model ?? null}
          initialStatus={existing?.status ?? null}
        />
      </main>
    </div>
  );
}
