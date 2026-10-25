"use client";
import { useState } from "react";
import Link from "next/link";
import { importWupexProduct, type WupexImportSetup } from "../import-actions";
import { wupexSellingPrice, type WupexImportInput } from "@/lib/wupex-import";
const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
export default function WupexImportForm({ setup }: { setup: WupexImportSetup }) {
 const [reference] = useState(() => crypto.randomUUID());
 const [markup, setMarkup] = useState("8"), [currency, setCurrency] = useState("");
 const [title, setTitle] = useState(setup.products[0]?.name.slice(0, 150) ?? "");
 const [region, setRegion] = useState(setup.products[0]?.region || "Global");
 const [rows, setRows] = useState(setup.products.map(p => ({ id: p.id, expectedCost: String(p.price), expectedCurrency: "USD", name: p.name.slice(0, 150), denomination: p.faceValue ? String(p.faceValue) : "1", optionType: (p.faceValue ? "CURRENCY" : "OTHER") as "CURRENCY" | "OTHER" })));
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
 const price = (cost: string) => { try { return "$" + wupexSellingPrice(cost, "1", markup); } catch { return "—"; } };
 async function submit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault(); if (busy) return;
  const form = new FormData(e.currentTarget);
  const input: WupexImportInput = { requestId: reference, connectionId: setup.connection, query: setup.query, catalogFilters: setup.catalogFilters, categoryId: String(form.get("category")), title, titleRu: "", description: String(form.get("description") ?? ""), descriptionRu: "", region, markup, exchangeRate: "1", options: rows.map(r => ({ ...r, currency })) };
  setBusy(true); setError("");
  try { const result = await importWupexProduct(input); if (result.data) setSaved(result.data.productId); else setError(result.error ?? "Import failed."); }
  catch { setError("The import response was interrupted. Retry to check the same draft."); }
  finally { setBusy(false); }
 }
 if (saved) return <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Draft created</h2><p className="mt-2 text-sm">Review the product, then enable Wupex delivery in its Supplier tab before publishing.</p><Link href={"/admin/products/" + saved + "/edit/supplier"} className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-3 font-bold text-white">Open supplier setup</Link></section>;
 return <form onSubmit={submit} className="space-y-4">
 {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
 <fieldset disabled={busy} className="space-y-4">
 <section className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2">
 <label className="text-sm font-bold">Product name<input required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} className={inputClass}/></label>
 <label className="text-sm font-bold">Website category<select name="category" required defaultValue="" className={inputClass}><option value="" disabled>Choose category</option>{setup.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="text-sm font-bold">Region<input required maxLength={100} value={region} onChange={e => setRegion(e.target.value)} className={inputClass}/></label>
 <label className="text-sm font-bold">Denomination currency<input required pattern="[A-Z]{3}" maxLength={3} value={currency} placeholder="INR, USD, EUR…" onChange={e => setCurrency(e.target.value.toUpperCase())} className={inputClass}/><span className="mt-1 block text-xs font-normal text-slate-500">Choose the card or game currency.</span></label>
 <label className="text-sm font-bold">Markup on supplier cost (%)<input type="number" min="0" max="1000" step="0.01" required value={markup} onChange={e => setMarkup(e.target.value)} className={inputClass}/></label>
 <p className="self-center text-sm text-slate-600">Supplier costs and selling prices refresh automatically using this saved markup. Supplier charges and selling prices are in USD.</p>
 <label className="text-sm font-bold sm:col-span-2">Description<textarea name="description" maxLength={5000} rows={3} className={inputClass}/></label>
 </section>
 <section className="rounded-xl border bg-white p-4"><h2 className="font-bold">Selected denominations</h2><div className="mt-3 space-y-3">{rows.map((r, i) => <div key={r.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_120px_130px]">
 <label className="min-w-0 text-xs">Option name<input required maxLength={150} value={r.name} onChange={e => setRows(rows.map((x, n) => n === i ? { ...x, name: e.target.value } : x))} className={inputClass}/></label>
 <label className="text-xs">Face value / units<input type="number" min="0.0001" max="1000000000" step="0.0001" required value={r.denomination} onChange={e => setRows(rows.map((x, n) => n === i ? { ...x, denomination: e.target.value } : x))} className={inputClass}/></label>
 <div className="text-sm"><p className="text-xs text-slate-500">Cost: {"$" + r.expectedCost}</p><p className="mt-2 font-bold">Sell: {price(r.expectedCost)}</p></div>
 </div>)}</div></section>
 {!!setup.products[0]?.fields.length && <section className="rounded-xl border bg-white p-4"><h2 className="font-bold">Customer details collected at checkout</h2>{setup.products[0].fields.map(f => <p key={f.key} className="mt-2 text-sm">{f.label}{f.placeholder ? " — " + f.placeholder : ""}</p>)}</section>}
 <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Creating draft…" : "Create product draft"}</button>
 </fieldset></form>;
}
