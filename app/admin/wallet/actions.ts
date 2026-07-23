"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function go(kind: "error" | "success", message: string): never {
  redirect(`/admin/wallet?${kind}=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const result = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!result.data) redirect("/admin/login?error=Access denied");
  return user;
}

async function notify(requestId: string, approved: boolean, reason?: string) {
  const admin = createAdminClient();
  const request = await admin.from("wallet_topup_requests").select("user_id, amount").eq("id", requestId).single();
  if (request.error) return console.error("Wallet notification lookup failed:", request.error);
  const customer = await admin.auth.admin.getUserById(request.data.user_id);
  const email = customer.data.user?.email;
  if (!email) return;
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(request.data.amount));
  const title = approved ? "Wallet top-up approved" : "Wallet top-up rejected";
  const message = approved ? `${amount} has been added to your InGamePin wallet.` : `Your ${amount} wallet top-up was rejected. Reason: ${reason}`;
  const results = await Promise.allSettled([
    sendEmail({ to: email, subject: `InGamePin ${title.toLowerCase()}`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h1>${title}</h1><p>${message}</p><a href="https://ingamepin.com/account/wallet">Open wallet</a></div>`, text: `${title}. ${message}` }),
    sendEmail({ to: "support@ingamepin.com", subject: `${title} - ${amount}`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h1>${title}</h1><p>Customer: ${email}</p><p>Amount: ${amount}</p>${reason ? `<p>Reason: ${reason}</p>` : ""}</div>`, text: `${title} for ${email}. Amount: ${amount}.` }),
  ]);
  results.forEach((result) => { if (result.status === "rejected") console.error("Wallet review email failed:", result.reason); });
}

export async function approveWalletTopup(formData: FormData) {
  const user = await requireAdmin();
  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) go("error", "Wallet request ID is missing.");
  const result = await createAdminClient().rpc("approve_wallet_topup", { p_request_id: requestId, p_admin_user_id: user.id });
  if (result.error) go("error", result.error.message);
  await notify(requestId, true);
  revalidatePath("/admin/wallet"); revalidatePath("/account/dashboard"); revalidatePath("/account/wallet");
  go("success", "Wallet top-up approved and balance credited.");
}

export async function rejectWalletTopup(formData: FormData) {
  const user = await requireAdmin();
  const requestId = String(formData.get("request_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestId) go("error", "Wallet request ID is missing.");
  if (reason.length < 3 || reason.length > 500) go("error", "Enter a rejection reason between 3 and 500 characters.");
  const result = await createAdminClient().rpc("reject_wallet_topup", { p_request_id: requestId, p_admin_user_id: user.id, p_reason: reason });
  if (result.error) go("error", result.error.message);
  await notify(requestId, false, reason);
  revalidatePath("/admin/wallet"); revalidatePath("/account/dashboard"); revalidatePath("/account/wallet");
  go("success", "Wallet top-up rejected.");
}
