import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { grantCreditsIfNeeded } from "@/lib/credits";

// Backs up the checkout-callback verification: if the user closes the tab
// right after paying (or the client-side call never fires), Razorpay still
// delivers this event server-to-server, so the credit grant isn't lost.
// No session/cookie here — trust comes entirely from the signature check.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "payment.captured") {
    const orderId = event.payload?.payment?.entity?.order_id;
    const paymentId = event.payload?.payment?.entity?.id;

    if (orderId && paymentId) {
      const admin = createAdminClient();
      const { data: payment } = await admin
        .from("payments")
        .select("id, user_id, status")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      if (payment && payment.status !== "success") {
        await grantCreditsIfNeeded(admin, payment.user_id, 5);
        await admin
          .from("payments")
          .update({ status: "success", razorpay_payment_id: paymentId })
          .eq("id", payment.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
