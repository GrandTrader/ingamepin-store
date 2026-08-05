import { notifyDigiseller } from "@/lib/digiseller-usdt";
import { createAdminClient } from "@/lib/supabase/admin";

export async function completeDigisellerBinancePayment(
  prepayId: string,
  transactionId: string,
) {
  const admin = createAdminClient();
  const result = await admin
    .from("digiseller_usdt_payments")
    .select(
      "invoice_id, amount, currency, status, network, digiseller_notified_at",
    )
    .eq("gateway_invoice_id", prepayId)
    .eq("network", "BINANCE_PAY")
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return false;

  const payment = result.data;
  if (payment.status !== "paid") {
    const updateResult = await admin
      .from("digiseller_usdt_payments")
      .update({
        status: "paid",
        transaction_hash: transactionId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", payment.invoice_id)
      .neq("status", "paid");
    if (updateResult.error) throw updateResult.error;
  }

  if (!payment.digiseller_notified_at) {
    await notifyDigiseller({
      invoiceId: payment.invoice_id,
      amount: Number(payment.amount).toFixed(2),
      currency: payment.currency,
      status: "paid",
    });

    const notificationResult = await admin
      .from("digiseller_usdt_payments")
      .update({
        digiseller_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", payment.invoice_id)
      .is("digiseller_notified_at", null);
    if (notificationResult.error) throw notificationResult.error;
  }

  return true;
}
