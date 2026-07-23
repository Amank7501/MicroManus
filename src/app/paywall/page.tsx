import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaywallForm from "./paywall-form";
import RazorpayButton from "./razorpay-button";

export default async function PaywallPage() {
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

  if (credits) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-black/[.08] bg-white p-6 text-center dark:border-white/[.145] dark:bg-zinc-950">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Unlock MicroManus
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Get 5 credits with a coupon code, or a one-time $5 payment — each credit is
            good for one research run.
          </p>
        </div>

        <PaywallForm />

        <div className="flex w-full items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
          or
          <span className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
        </div>

        <RazorpayButton />
      </main>
    </div>
  );
}
