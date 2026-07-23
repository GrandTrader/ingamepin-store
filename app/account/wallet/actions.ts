"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

function walletRedirect(kind: "error" | "success", message: string): never {
  redirect(`/account/wallet?${kind}=${encodeURIComponent(message)}`);
}

export async function submitWalletTopup(formData: FormData) {
  const amount = Number(formData.get("amount"));
  const paymentReference = String(formData.get("payment_reference") ?? "").trim();
  if (!Number.isFinite(amount) || amount < 10 || amount > 100000) walletRedirect("error", "Enter an amount between INR 10 and INR 100,000.");
  if (paymentReference.length < 4 || paymentReference.length > 150) walletRedirect("error", "Enter a valid UPI transaction or UTR number.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/account?error=Please sign in to continue.");

  const result = await supabase.rpc("create_wallet_topup_request", {
    p_amount: amount,
    p_payment_method: "UPI",
    p_payment_reference: paymentReference,
  });
  if (result.error) walletRedirect("error", result.error.message);

  const amountLabel = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
  const customerName = String(user.user_metadata?.full_name ?? "").trim() || "Customer";
  const emailResults = await Promise.allSettled([
    sendEmail({
      to: user.email,
      subject: "InGamePin wallet top-up submitted",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1>Wallet top-up submitted</h1><p>Hello ${customerName}, your request to add <strong>${amountLabel}</strong> is awaiting payment verification.</p><p>Reference: <strong>${paymentReference}</strong></p><p>We will email you after review.</p></div>`,
      text: `Your InGamePin wallet top-up of ${amountLabel} is awaiting verification. Reference: ${paymentReference}.`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
      subject: `Wallet top-up review - ${amountLabel}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1>New wallet top-up request</h1><p>Customer: <strong>${customerName}</strong></p><p>Email: <strong>${user.email}</strong></p><p>Amount: <strong>${amountLabel}</strong></p><p>UPI reference: <strong>${paymentReference}</strong></p><a href="https://ingamepin.com/admin/wallet" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Review wallet request</a></div>`,
      text: `New wallet top-up from ${user.email}. Amount: ${amountLabel}. Reference: ${paymentReference}.`,
    }),
  ]);
  emailResults.forEach((emailResult, index) => {
    if (emailResult.status === "rejected") console.error(index === 0 ? "Customer wallet request email failed:" : "Admin wallet request email failed:", emailResult.reason);
  });

  revalidatePath("/account/dashboard");
  revalidatePath("/account/wallet");
  walletRedirect("success", "Wallet top-up submitted for verification.");
}

export async function startBinanceWalletTopup(formData: FormData) {
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount < 10 || amount > 100000) {
    walletRedirect(
      "error",
      "Enter an amount between INR 10 and INR 100,000."
    );
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
      result.error?.message ?? "Unable to start Binance Pay."
    );
  }

  revalidatePath("/account/dashboard");
  revalidatePath("/account/wallet");
  redirect(`/account/wallet/binance-pay/${result.data}`);
}
