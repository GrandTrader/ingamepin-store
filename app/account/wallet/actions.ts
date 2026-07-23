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
