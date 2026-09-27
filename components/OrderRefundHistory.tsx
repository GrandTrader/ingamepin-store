import { formatPaymentMethod } from "@/lib/payment-method-label";
import { REFUND_STATUS_LABELS, type OrderRefundRequest, type RefundEvent } from "@/lib/order-refund-request";

export default function OrderRefundHistory({ requests, events }: { requests: OrderRefundRequest[]; events: RefundEvent[] }) {
  return <div className="space-y-4">{requests.map(request => <article key={request.id} className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-900">
    <h3 className="font-bold">{REFUND_STATUS_LABELS[request.status] || request.status}</h3>
    <p className="mt-2">{request.currency} {Number(request.amount).toFixed(2)} · {formatPaymentMethod(request.refund_method)}</p>
    <p className="mt-1">Network fee / commission: {request.currency} {Number(request.network_fee ?? 0).toFixed(2)}</p>
    <p className="mt-1 font-bold">{request.status === "COMPLETED" ? "Refund sent" : "Customer receives"}: {request.currency} {Number(request.net_amount ?? request.amount).toFixed(2)}</p>
    <p className="mt-2 whitespace-pre-wrap break-words">Reason: {request.reason}</p>
    {request.payout_details && <p className="mt-2 whitespace-pre-wrap break-words">Refund details: {request.payout_details}</p>}
    {request.admin_note && <p className="mt-2 whitespace-pre-wrap break-words">Admin response: {request.admin_note}</p>}
    {request.transaction_id && <p className="mt-2 break-all">Refund transaction: {request.transaction_id}</p>}
    <p className="mt-2 break-all text-xs text-slate-500">Request: {request.id}</p>
    <ol className="mt-3 space-y-2 border-t border-orange-200 pt-3">{events.filter(event => event.request_id === request.id).map(event => <li key={event.id} className="text-xs">
      <time>{new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</time> — {event.note}
    </li>)}</ol>
  </article>)}</div>;
}
