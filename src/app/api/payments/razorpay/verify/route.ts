import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { grantCreditsIfNeeded } from "@/lib/credits";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    await admin
      .from("payments")
      .update({ status: "failed", razorpay_payment_id: paymentId })
      .eq("id", payment.id);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  const { balance } = await grantCreditsIfNeeded(admin, user.id, 5);

  if (payment.status !== "success") {
    await admin
      .from("payments")
      .update({ status: "success", razorpay_payment_id: paymentId })
      .eq("id", payment.id);
  }

  return NextResponse.json({ balance });
}
