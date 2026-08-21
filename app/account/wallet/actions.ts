"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function walletRedirect(kind: "error" | "success", message: string): never {
  redirect(`/account/wallet?${kind}=${encodeURIComponent(message)}`);
}

export async function startBinanceWalletTopup(formData: FormData) {
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    walletRedirect("error", "Enter an amount between USD 1 and USD 10,000.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/account?error=Please sign in to continue.");
  }

  const paymentReference = `BINANCE-${crypto.randomUUID()}`;
  const result = await supabase.rpc("create_wallet_topup_request", {
    p_amount: amount,
    p_payment_method: "BINANCE_PAY",
    p_payment_reference: paymentReference,
  });

  if (result.error || !result.data) {
    walletRedirect(
      "error",
      result.error?.message ?? "Unable to start Binance Pay.",
    );
  }

  revalidatePath("/account/dashboard");
  revalidatePath("/account/wallet");
  redirect(`/account/wallet/binance-pay/${result.data}`);
}

export async function claimWalletRefund(formData: FormData) {
  const refundId = String(formData.get("refund_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(refundId)) walletRedirect("error", "Refund is invalid.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/account?error=Please sign in to continue.");
  const result = await supabase.rpc("credit_order_item_refund", { p_refund_id: refundId });
  if (result.error) walletRedirect("error", result.error.message);
  revalidatePath("/account/dashboard");
  revalidatePath("/account/wallet");
  walletRedirect("success", `Refund credited. Your wallet balance is now USD ${Number(result.data?.balance ?? 0).toFixed(2)}.`);
}
