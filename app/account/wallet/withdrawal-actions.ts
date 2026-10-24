"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isReceiptId } from "@/lib/wallet-receipt";
import { withdrawalQuote, validWithdrawalAddress } from "@/lib/wallet-withdrawals";

function finish(form: FormData, kind: string, message: string): never {
  const path = form.get("return_to") === "/account/portal/wallet" ? "/account/portal/wallet" : "/account/wallet";
  redirect(path + "?" + new URLSearchParams({ [kind]: message }) + "#withdrawals");
}
function refresh() {
  for (const path of ["/account/wallet", "/account/portal/wallet", "/account/dashboard", "/account/portal", "/admin/wallet/withdrawals", "/admin/wallet/activity"]) revalidatePath(path);
}
export async function requestWithdrawal(form: FormData) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/account?error=Sign in with a verified email.");
  const key = String(form.get("request_key") ?? "");
  const amount = String(form.get("amount") ?? "").trim();
  const network = String(form.get("network") ?? "");
  const address = String(form.get("wallet_address") ?? "").trim();
  const quote = withdrawalQuote(amount, network);
  if (!isReceiptId(key) || !quote.valid || !validWithdrawalAddress(network, address) || form.get("confirmed") !== "yes") {
    finish(form, "error", "Check the amount, network and address, then confirm the payout details.");
  }
  // The database derives the owner, locks available funds and calculates fees itself.
  const result = await client.rpc("request_wallet_withdrawal", { p_request_key: key, p_amount: quote.amount, p_network: network, p_wallet_address: address });
  if (result.error) finish(form, "error", result.error.message);
  refresh();
  finish(form, "success", "Withdrawal requested. The amount is reserved while awaiting admin approval.");
}
export async function cancelWithdrawal(form: FormData) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/account?error=Sign in with a verified email.");
  const id = String(form.get("request_id") ?? "");
  if (!isReceiptId(id)) finish(form, "error", "Invalid withdrawal request.");
  const result = await client.rpc("cancel_wallet_withdrawal", { p_request_id: id });
  if (result.error) finish(form, "error", result.error.message);
  refresh();
  finish(form, "success", "Withdrawal cancelled. The full reserved amount is available again.");
}
