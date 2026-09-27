"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderRefundPermission } from "./actions";

export default function OrderRefundPermission({ orderId, enabled, locked }: { orderId: string; enabled: boolean; locked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <section className="mt-6 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-bold">Customer refund option</h2>
    <p className="mt-2 text-sm">{locked ? "This order already has a refund request. Use the refund review below." : enabled ? "Enabled: the customer can request a refund while payment is confirmed and nothing has been delivered." : "Disabled: the customer cannot request a refund for this order."}</p>
    {!locked && <form className="mt-3" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      startTransition(async () => {
        try {
          const result = await setOrderRefundPermission(form);
          setMessage(result.error || (result.enabled ? "Refund option enabled for this order." : "Refund option disabled for this order."));
          if (!result.error) router.refresh();
        } catch { setMessage("Unable to update the refund option. Reload the order and try again."); }
      });
    }}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button type="submit" role="switch" aria-checked={enabled} disabled={pending} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving…" : enabled ? "Disable refund option" : "Enable refund option"}</button>
    </form>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
