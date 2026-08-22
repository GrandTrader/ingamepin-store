import "server-only";

import { notifyAdminsByPush } from "@/lib/admin-push";
import { sendEmail } from "@/lib/email";

export async function notifyAdminsOfWalletTopup(input: {
  requestId: string;
  customerEmail: string;
  creditAmount: number;
  paymentTotal: number;
  gateway: string;
}) {
  const credit = `$${input.creditAmount.toFixed(2)}`;
  const payment = `$${input.paymentTotal.toFixed(2)}`;
  const gateway = input.gateway.replaceAll("_", " ");
  const body = `${input.customerEmail} · Credit ${credit} · Pay ${payment} · ${gateway}`;

  const results = await Promise.allSettled([
    notifyAdminsByPush(`wallet-topup:${input.requestId}`, {
      title: "New wallet top-up",
      body,
      url: "/admin/wallet",
      tag: `wallet-topup-${input.requestId}`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
      subject: `New wallet top-up - ${credit}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h1>New wallet top-up</h1><p>Customer: <strong>${input.customerEmail}</strong></p><p>Wallet credit: <strong>${credit}</strong></p><p>Customer payment: <strong>${payment}</strong></p><p>Gateway: <strong>${gateway}</strong></p><p><a href="https://ingamepin.com/admin/wallet">Open wallet top-ups</a></p></div>`,
      text: `New wallet top-up. Customer: ${input.customerEmail}. Wallet credit: ${credit}. Customer payment: ${payment}. Gateway: ${gateway}.`,
    }),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Wallet admin notification failed:", result.reason);
    }
  });
}
