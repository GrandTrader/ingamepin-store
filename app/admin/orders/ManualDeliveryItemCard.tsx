"use client";

import { useState } from "react";
import { sendManualOrderItem } from "./actions";

export default function ManualDeliveryItemCard({ orderId, item }: { orderId: string; item: { id: string; product_name: string; option_name: string | null; quantity: number; is_bulk_order?: boolean } }) {
  const [codes, setCodes] = useState("");
  function loadCsv(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const values = String(reader.result ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(",")[0].replace(/^"|"$/g, "").replaceAll('""', '"')).filter((value) => value.toLowerCase() !== "voucher code");
      setCodes(values.join("\n"));
    };
    reader.readAsText(file);
  }
  return <article className="rounded-xl border border-blue-200 bg-white p-3">
    <p className="line-clamp-2 font-black text-slate-800">{item.product_name}{item.option_name ? ` · ${item.option_name}` : ""}</p>
    <p className="mt-1 text-xs text-slate-500">
      {item.is_bulk_order
        ? "Upload any number of codes, one per line. You can send multiple batches."
        : `Enter exactly ${item.quantity} code${item.quantity === 1 ? "" : "s"}, one per line.`}
    </p>
    <form id={`send-${item.id}`} action={sendManualOrderItem} className="mt-3 grid gap-2">
      <input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="item_id" value={item.id} />
      <label className="text-xs font-bold text-slate-600">CSV file<input type="file" accept=".csv,.txt" onChange={(event) => loadCsv(event.target.files?.[0])} className="mt-1 block w-full rounded-lg border border-blue-200 bg-blue-50 text-xs text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white hover:file:bg-blue-500" /></label>
      <textarea name="codes" value={codes} onChange={(event) => setCodes(event.target.value)} rows={4} required placeholder="One code per line" className="w-full resize-y rounded-lg border border-blue-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" />
    </form>
    <button form={`send-${item.id}`} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">Send denomination</button>
  </article>;
}
