"use client";

import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export default function RazorpayButton() {
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handlePay() {
    setError(null);
    setLoading(true);

    const orderRes = await fetch("/api/payments/razorpay/order", { method: "POST" });
    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      setError(orderData.error ?? "Could not start payment");
      setLoading(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: "MicroManus",
      description: "Unlock MicroManus — 5 credits",
      theme: { color: "#000000" },
      modal: {
        ondismiss: () => setLoading(false),
      },
      handler: async (response: RazorpayResponse) => {
        const verifyRes = await fetch("/api/payments/razorpay/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        });
        const verifyData = await verifyRes.json();
        setLoading(false);

        if (!verifyRes.ok) {
          setError(verifyData.error ?? "Payment verification failed");
          return;
        }

        router.push("/dashboard");
        router.refresh();
      },
    });

    rzp.on("payment.failed", () => {
      setError("Payment failed. Please try again.");
      setLoading(false);
    });

    rzp.open();
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
      />
      <button
        type="button"
        onClick={handlePay}
        disabled={!scriptReady || loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        {loading ? "Opening checkout…" : "Pay $5 to unlock"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </>
  );
}
