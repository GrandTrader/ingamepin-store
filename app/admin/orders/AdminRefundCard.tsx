import { approveWalletRefund } from "./actions";

type Refund = { id: string; quantity: number; amount: number | string; currency: string; status: string };

export default function AdminRefundCard({ orderId, item, deliveredQuantity, refunds }: {
  orderId: string;
  item: { id: string; product_name: string; option_name: string | null; quantity: number };
  deliveredQuantity: number;
  refunds: Refund[];
}) {
  const refundedQuantity = refunds.filter((refund) => refund.status !== "CANCELLED").reduce((sum, refund) => sum + refund.quantity, 0);
  const available = Math.max(0, item.quantity - deliveredQuantity - refundedQuantity);
  return <article className="rounded-xl border border-orange-200 bg-orange-50 p-3">
    <p className="font-black text-slate-800">Refund · {item.option_name ?? item.product_name}</p>
    <p className="mt-1 text-xs text-slate-600">Delivered: {deliveredQuantity} · Refunded: {refundedQuantity} · Available: {available}</p>
    {refunds.filter((refund) => refund.status !== "CANCELLED").map((refund) => <p key={refund.id} className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-orange-700">{refund.quantity} item(s) · {refund.currency} {Number(refund.amount).toFixed(2)} · {refund.status.replaceAll("_", " ")}</p>)}
    {available > 0 && <form action={approveWalletRefund} className="mt-3 grid gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={item.id} />
      <label className="text-xs font-bold text-slate-600">Quantity to refund<input name="quantity" type="number" min="1" max={available} defaultValue={available} required className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-3 py-2" /></label>
      <label className="text-xs font-bold text-slate-600">Reason<input name="reason" minLength={3} maxLength={500} defaultValue="Product out of stock" required className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-3 py-2" /></label>
      <p className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs text-slate-600">Registered customers are credited immediately. Only unregistered customers receive a pending claim.</p>
      <button className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-500">Issue wallet refund</button>
    </form>}
  </article>;
}
