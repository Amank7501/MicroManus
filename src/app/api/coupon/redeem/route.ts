import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const COUPON_CODE = "SID_DRDROID";
const COUPON_CREDITS = 5;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

  if (code !== COUPON_CODE) {
    return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already have access" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("credits")
    .insert({ user_id: user.id, balance: COUPON_CREDITS })
    .select("balance")
    .single();

  if (error) {
    // Unique-violation means a concurrent request already granted credits.
    const status = error.code === "23505" ? 400 : 500;
    const message = error.code === "23505" ? "You already have access" : "Could not grant credits";
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ balance: inserted.balance });
}
