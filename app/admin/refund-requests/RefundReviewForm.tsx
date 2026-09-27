"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewOrderRefund } from "./actions";
import type { OrderRefundRequest } from "@/lib/order-refund-request";

export default function RefundReviewForm({ request }: { request: OrderRefundRequest }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (!["REQUESTED", "APPROVED"].includes(request.status)) return null;
  return <form className="mt-3 rounded-xl border bg-white p-4" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    form.set("action", submitter?.value || "");
    startTransition(async () => { try { const result = await reviewOrderRefund(form); setMessage(result.error || (result.status === "COMPLETED" ? "Refund completed and order cancelled." : result.status === "APPROVED" ? "Approved. Send the refund, then record its transaction ID." : "Request declined; delivery can resume.")); router.refresh(); } catch { setMessage("Unable to confirm the result. Reload refund history before retrying."); } });
  }}>
    <fieldset disabled={pending} className="space-y-3">
      <input type="hidden" name="request_id" value={request.id} />
      <p className="text-sm">{request.refund_method === "WALLET" ? "Approval immediately credits the full amount to the customer’s wallet and cancels the order." : "Approval reserves this order for refund. Send the money through the selected payment method, then record the completed transfer here."}</p>
      <p className="text-sm font-bold">Refund to send: {request.currency} {Number(request.net_amount ?? request.amount).toFixed(2)} · Fee deducted: {request.currency} {Number(request.network_fee ?? 0).toFixed(2)}</p>
      <label className="block text-sm font-bold">Admin response (visible to customer)<textarea name="note" maxLength={1000} rows={2} className="mt-2 w-full rounded-lg border p-3" /></label>
      {request.status === "APPROVED" && <>
        <label className="block text-sm font-bold">Completed refund transaction ID<input name="reference" required minLength={3} maxLength={200} className="mt-2 w-full rounded-lg border p-3" /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" required />I confirm {request.currency} {Number(request.net_amount ?? request.amount).toFixed(2)} was successfully sent to the customer after the stated fee deduction.</label>
      </>}
      <div className="flex flex-wrap gap-3">{request.status === "REQUESTED" ? <>
        <button name="action" value="APPROVE" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white">{request.refund_method === "WALLET" ? "Approve and credit wallet" : "Approve refund"}</button>
        <button name="action" value="REJECT" className="rounded-lg border border-red-300 px-4 py-3 text-sm font-bold text-red-700">Decline request</button>
      </> : <button name="action" value="COMPLETE" className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Record refund and cancel order</button>}</div>
    </fieldset>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </form>;
}
