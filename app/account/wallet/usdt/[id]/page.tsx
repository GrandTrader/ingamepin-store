import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import WalletUsdtPayment from "./WalletUsdtPayment";

export const dynamic = "force-dynamic";

export default async function WalletUsdtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account?error=Please sign in to continue.");

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
    redirect("/account/wallet?success=Wallet+top-up+completed");
  }

  return <WalletUsdtPayment requestId={topup.id} />;
}
