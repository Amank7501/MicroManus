import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Used by both the Razorpay checkout callback and the webhook — either one
// might arrive first (or, rarely, both), so granting must be idempotent:
// a user who already has a credits row never gets a second grant.
export async function grantCreditsIfNeeded(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<{ granted: boolean; balance: number }> {
  const { data: existing } = await admin
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { granted: false, balance: existing.balance };
  }

  const { data: inserted, error } = await admin
    .from("credits")
    .insert({ user_id: userId, balance: amount })
    .select("balance")
    .single();

  if (error || !inserted) {
    // Unique-violation means a concurrent grant (checkout callback and
    // webhook racing each other) already created the row — re-read it.
    const { data: raceRow } = await admin
      .from("credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    return { granted: false, balance: raceRow?.balance ?? 0 };
  }

  return { granted: true, balance: inserted.balance };
}
