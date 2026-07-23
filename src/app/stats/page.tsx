import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatCost, formatTokens } from "@/lib/format";

type ChatStats = {
  chatId: string;
  title: string;
  input: number;
  output: number;
  cached: number;
  cost: number;
};

export default async function StatsPage() {
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

  const { data: usageRows } = await supabase
    .from("usage")
    .select("chat_id, input_tokens, output_tokens, cached_tokens, cost")
    .eq("user_id", user.id);

  const { data: chats } = await supabase.from("chats").select("id, title").eq("user_id", user.id);

  const titleByChatId = new Map((chats ?? []).map((c) => [c.id, c.title]));

  const byChat = new Map<string, ChatStats>();
  for (const row of usageRows ?? []) {
    const existing = byChat.get(row.chat_id) ?? {
      chatId: row.chat_id,
      title: titleByChatId.get(row.chat_id) ?? "Deleted chat",
      input: 0,
      output: 0,
      cached: 0,
      cost: 0,
    };
    existing.input += row.input_tokens;
    existing.output += row.output_tokens;
    existing.cached += row.cached_tokens;
    existing.cost += Number(row.cost);
    byChat.set(row.chat_id, existing);
  }

  const rows = [...byChat.values()].sort((a, b) => b.cost - a.cost);

  const totals = rows.reduce(
    (acc, r) => ({
      input: acc.input + r.input,
      output: acc.output + r.output,
      cached: acc.cached + r.cached,
      cost: acc.cost + r.cost,
    }),
    { input: 0, output: 0, cached: 0, cost: 0 },
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Cost & usage
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Token usage and $ cost per chat, priced by each model's rates.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
          >
            Back to dashboard
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/[.12] px-6 py-12 text-center dark:border-white/[.15]">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No usage yet — send a message in a chat to see costs here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[560px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="border-b border-black/[.08] dark:border-white/[.145]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Chat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Input
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Output
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Cached
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.chatId}
                    className="border-b border-black/[.05] transition-colors last:border-0 hover:bg-black/[.02] dark:border-white/[.06] dark:hover:bg-white/[.03]"
                  >
                    <td className="max-w-[220px] truncate px-4 py-3">
                      <Link
                        href={`/chat/${r.chatId}`}
                        className="font-medium text-black underline decoration-black/20 underline-offset-4 hover:decoration-black/40 dark:text-zinc-50 dark:decoration-white/25 dark:hover:decoration-white/50"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                      {formatTokens(r.input)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                      {formatTokens(r.output)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                      {formatTokens(r.cached)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-black dark:text-zinc-50">
                      {formatCost(r.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/[.08] bg-black/[.02] font-semibold dark:border-white/[.145] dark:bg-white/[.03]">
                  <td className="px-4 py-3 text-black dark:text-zinc-50">Total</td>
                  <td className="px-4 py-3 text-right text-black dark:text-zinc-50">
                    {formatTokens(totals.input)}
                  </td>
                  <td className="px-4 py-3 text-right text-black dark:text-zinc-50">
                    {formatTokens(totals.output)}
                  </td>
                  <td className="px-4 py-3 text-right text-black dark:text-zinc-50">
                    {formatTokens(totals.cached)}
                  </td>
                  <td className="px-4 py-3 text-right text-black dark:text-zinc-50">
                    {formatCost(totals.cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
