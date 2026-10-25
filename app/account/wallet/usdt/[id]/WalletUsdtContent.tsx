import { notFound, redirect } from "next/navigation";

import { expireStaleWalletTopups } from "@/lib/wallet-topup-expiry";
import { createClient } from "@/lib/supabase/server";
import WalletUsdtPayment from "./WalletUsdtPayment";



export default async function WalletUsdtPage({
  params, portal = false,
}: {
  params: Promise<{ id: string }>; portal?: boolean;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account?error=Please sign in to continue.");

  await expireStaleWalletTopups(user.id);
  const result = await supabase
    .from("wallet_topup_requests")
    .select("id, amount, payment_method, status, gateway_order_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const topup = result.data;

  if (
    !topup ||
    topup.payment_method !== "USDT_DIRECT" ||
    !topup.gateway_order_id
  ) {
    notFound();
  }

  if (topup.status === "APPROVED") {
    redirect(`${portal ? "/account/portal/wallet" : "/account/wallet"}?success=Wallet+top-up+completed`);
  }

  if (topup.status !== "PENDING") {
    redirect(`${portal ? "/account/portal/wallet" : "/account/wallet"}?error=This+top-up+is+closed.+If+you+already+paid,+contact+support+before+trying+again.`);
  }

  return <WalletUsdtPayment requestId={topup.id} />;
}
