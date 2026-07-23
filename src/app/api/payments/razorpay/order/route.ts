import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrder } from "@/lib/razorpay";

// Labeled "$5" in the UI; charged as the INR equivalent at ~₹96.5/USD.
const AMOUNT_INR = 483;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: existingCredits } = await admin
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingCredits) {
    return NextResponse.json({ error: "You already have access" }, { status: 400 });
  }

  let order: { id: string; amount: number; currency: string };
  try {
    order = await createOrder(AMOUNT_INR * 100, "INR", `mm_${user.id.slice(0, 8)}_${Date.now()}`);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start payment" },
      { status: 502 },
    );
  }

  const { error } = await admin.from("payments").insert({
    user_id: user.id,
    method: "razorpay",
    amount: AMOUNT_INR,
    status: "pending",
    razorpay_order_id: order.id,
  });

  if (error) {
    return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  });
}
