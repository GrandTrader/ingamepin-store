"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fkImportIssue, fkPlainText } from "@/lib/fkwallet-import";
import { loadFKImports } from "./import/actions";
import { cancelFKReview, confirmFKPurchase, connectFKWallet, loadFKDashboard, loadFKProducts, prepareFKPurchase, readFKPurchaseResult, refreshFKPurchase } from "./actions";
import type { FKDashboard, FKImportedProduct, FKProduct, FKResult, FKReview, FKTransaction } from "@/lib/fkwallet-types";

const box = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";
const button = "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const money = (value: number, currency: string) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value)} ${currency}`;
const date = (value: string) => new Date(value).toLocaleString();

export default function FKWalletPanel() {
  const [dashboard, setDashboard] = useState<FKDashboard | null>(null);
  const [tab, setTab] = useState<"products" | "imports" | "history" | "connection">("products");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<FKProduct[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [importSelection, setImportSelection] = useState<number[]>([]);
  const [imports, setImports] = useState<{ products: FKImportedProduct[]; total: number }>({ products: [], total: 0 });
  const [importPage, setImportPage] = useState(1);
  const [selected, setSelected] = useState<FKProduct | null>(null);
  const [review, setReview] = useState<FKReview | null>(null);
  const [result, setResult] = useState<{ id: string; value: FKResult } | null>(null);
  const operation = useRef(false);
  const purchaseSection = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    loadFKDashboard().then(data => { if (active) { setDashboard(data); if (!data.connected) setTab("connection"); } })
      .catch(() => { if (active) setMessage("The admin connection could not be loaded. Refresh the page or sign in again."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (tab === "products" && (selected || review)) purchaseSection.current?.scrollIntoView({ block: "start" });
  }, [selected, review, tab]);

  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setMessage("");
    try { await work(); }
    catch { setMessage("The request could not finish. Check Recent purchases before trying a purchase again."); }
    finally { operation.current = false; setBusy(false); }
  }
  async function refresh() { setDashboard(await loadFKDashboard()); }
  function chooseCategory(value: string) {
    if (operation.current || review) return;
    setCategory(value); setSelected(null); setProducts([]); setPage(1); setSearch(""); setImportSelection([]); setMessage("");
    if (value) void run(async () => {
      const response = await loadFKProducts(Number(value));
      if (response.error) setMessage(response.error);
      else setProducts(response.data ?? []);
    });
  }
  function updateTransaction(transaction: FKTransaction) {
    setDashboard(previous => previous ? { ...previous, transactions: [transaction, ...previous.transactions.filter(t => t.id !== transaction.id)].slice(0, 20) } : previous);
  }
  const filtered = products.filter(product => product.name.toLowerCase().includes(search.trim().toLowerCase()));
  const activeCategory = dashboard?.categories.find(item => String(item.id) === category);
  const parentCategory = dashboard?.categories.find(item => item.id === activeCategory?.parentId);
  const subcategories = dashboard?.categories.filter(item => item.parentId === activeCategory?.id) ?? [];
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  function selectPage() {
    const visible = filtered.slice((page - 1) * 20, page * 20);
    const supported = visible.filter(product => !fkImportIssue(product));
    if (!supported.length) { setMessage("No importable products on this page. Check the reason shown under each product."); return; }
    const ids = [...new Set([...importSelection, ...supported.map(product => product.id)])];
    if (ids.length > 50) { setMessage("Select up to 50 denominations per import."); return; }
    setImportSelection(ids);
    setMessage(visible.length !== supported.length ? `${supported.length} products selected on this page. Other products need a separate setup.` : "");
  }
  async function refreshImports(nextPage: number) {
    const response = await loadFKImports(nextPage);
    if (response.error) setMessage(response.error);
    else if (response.data) { setImports(response.data); setImportPage(nextPage); }
  }

  return <div className="space-y-5" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={`rounded-full px-3 py-1 text-sm font-semibold ${dashboard?.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{dashboard ? dashboard.connected ? "Connected" : "Not connected" : "Checking connection…"}</p>
      <button className={secondary} disabled={busy} onClick={() => void run(refresh)}>Refresh balance &amp; connection</button>
    </div>
    {message && <p role="status" className="whitespace-pre-wrap rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">{message}</p>}
    {dashboard?.errors.map((error, index) => <p key={index} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{error}</p>)}
    <section aria-label="FKWallet balances" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {dashboard?.balances.map(balance => <div key={balance.currency} className={box}><p className="text-sm text-slate-500">FKWallet balance · {balance.currency}</p><p className="mt-2 break-words text-2xl font-black">{money(balance.value, balance.currency)}</p></div>)}
    </section>
    <nav aria-label="FKWallet sections" className="flex flex-wrap gap-2">
      {([['products', 'Digital products'], ['imports', 'Imported products'], ['history', 'Recent purchases'], ['connection', 'Connection']] as const).map(([key, label]) => <button key={key} className={tab === key ? button : secondary} aria-pressed={tab === key} disabled={busy} onClick={() => { setTab(key); setResult(null); if (key === "imports") void run(() => refreshImports(1)); }}>{label}</button>)}
    </nav>

    {tab === "connection" && <section className={box}>
      <h2 className="text-xl font-bold">Connect FKWallet</h2><p className="mt-2 text-sm text-slate-600">Use your FKWallet API keys. Testing the connection only reads your balance.</p>
      {dashboard?.configuredByEnvironment ? <p className="mt-4">This connection uses keys configured on the server.</p> : <form className="mt-4 max-w-xl space-y-4" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        void run(async () => {
        const response = await connectFKWallet(values);
        if (response.error) { setMessage(response.error); return; }
        form.reset();
        await refresh(); setMessage("FKWallet connected. You can now browse digital products."); setTab("products");
      }); }}>
        <label className="block text-sm font-semibold">Public API key<input className={input} name="publicKey" type="password" autoComplete="off" required maxLength={256} /></label>
        <label className="block text-sm font-semibold">Private API key<input className={input} name="privateKey" type="password" autoComplete="new-password" required maxLength={512} /></label>
        <p className="text-xs text-slate-500">Keys are encrypted on the server and are never displayed after saving.</p>
        <button disabled={busy || !dashboard?.databaseReady} className={button}>{busy ? "Checking…" : "Test & save connection"}</button>
      </form>}
      <a className="mt-4 inline-block text-sm font-semibold text-blue-700 underline" href="https://fkwallet.io/personal/settings/api-key" target="_blank" rel="noreferrer">Open FKWallet API settings ↗</a>
    </section>}

    {tab === "products" && <>
      <section className={box}>
        <label className="mb-4 block text-sm font-semibold">Find a category<input className={input} placeholder="For example: Steam, Apple, PlayStation" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Category<select aria-label="Category" className={input} value={category} disabled={busy || !dashboard?.categories.length || !!review} onChange={event => chooseCategory(event.target.value)}><option value="">Choose a category</option>{dashboard?.categories.filter(item => String(item.id) === category || item.name.toLowerCase().includes(categorySearch.toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.parentId ? "— " : ""}{item.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Search in category<input className={input} placeholder="Product name" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        </div>
        {parentCategory && <button className="mt-4 text-sm font-semibold text-blue-700 underline disabled:opacity-50" disabled={busy || !!review} onClick={() => chooseCategory(String(parentCategory.id))}>Back to {parentCategory.name}</button>}
        {subcategories.length > 0 && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold">Choose a subcategory</p>
          <p className="mt-1 text-sm text-slate-600">{activeCategory?.name} has separate product lists. Choose the region or option you need.</p>
          <div className="mt-3 flex flex-wrap gap-2">{subcategories.map(item => <button key={item.id} className={`${secondary} max-w-full bg-white text-left`} disabled={busy || !!review} onClick={() => chooseCategory(String(item.id))}>{item.name}</button>)}</div>
        </div>}
        <p className="mt-3 text-xs text-slate-500">Prices are supplier costs in the displayed currency. These products are not automatically published on your website.</p>
        {!!products.length && <div className="mt-4 space-y-3 rounded-xl bg-blue-50 p-4 text-sm"><p>Select matching denominations to import as one website product. You set the markup and exchange rate on the next screen. Fixed-price codes and products with simple customer fields, such as a Telegram username, are supported.</p>
          <div className="flex flex-wrap items-center gap-3"><strong>{importSelection.length} selected</strong><button className={secondary} disabled={busy || !!review} onClick={selectPage}>Select this page</button><button disabled={busy} className="underline" onClick={() => { setImportSelection([]); setMessage(""); }}>Clear selection</button>
            {importSelection.length > 0 && !busy && !review && <Link className={button} href={`/admin/fkwallet/import?${new URLSearchParams({ category, items: importSelection.join(",") })}`}>Set markup &amp; import selected</Link>}
          </div>
        </div>}
        {category && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-2"><span className="sr-only">Import selection</span></th><th className="p-3">Product</th><th className="p-3">Supplier price</th><th className="p-3"><span className="sr-only">Manual purchase</span></th></tr></thead>
          <tbody>{filtered.slice((page - 1) * 20, page * 20).map(product => <tr key={product.id} className={`border-b border-slate-200 ${selected?.id === product.id ? "bg-blue-50" : ""}`}><td className="p-2"><input type="checkbox" aria-label={`Import ${product.name}`} disabled={busy || !!review || !!fkImportIssue(product)} checked={importSelection.includes(product.id)} onChange={e => { if (e.target.checked && importSelection.length >= 50) setMessage("Select up to 50 denominations per import."); else setImportSelection(e.target.checked ? [...importSelection, product.id] : importSelection.filter(id => id !== product.id)); }} /></td><td className="min-w-0 p-3 font-semibold sm:min-w-48">{product.name}{fkImportIssue(product) && <small className="mt-1 block font-normal text-slate-500">{fkImportIssue(product)}</small>}</td><td className="p-3 sm:whitespace-nowrap">{product.price ? money(product.price, product.currency) : `Variable value · ${product.currency}`}</td><td className="p-3 text-right"><button className={secondary} disabled={busy || !!review} onClick={() => { setSelected(product); setMessage(""); }}>Select</button><small className="mt-1 block text-slate-500">Manual purchase</small></td></tr>)}</tbody>
        </table>{!filtered.length && <p className="py-5 text-sm">{busy ? "Loading products…" : !products.length && subcategories.length ? "Choose a subcategory above to see its products." : search.trim() ? "No products match your search." : "No products found in this category."}</p>}</div>}
        {filtered.length > 20 && <div className="mt-4 flex items-center justify-between gap-2 text-sm"><button className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className={secondary} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
        {!category && <p className="mt-6 text-sm text-slate-500">{dashboard?.connected ? "Choose a category to see FKWallet products and current prices." : "Connect FKWallet to load the catalogue."}</p>}
      </section>
      {selected && !review && <section ref={purchaseSection} className={box} key={selected.id}>
        <h2 className="text-xl font-bold">{selected.name}</h2>
        <p className="mt-2 font-semibold text-blue-700">{selected.price ? `Supplier price: ${money(selected.price, selected.currency)}` : `Variable-value product · ${selected.currency}`}</p>
        {selected.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{fkPlainText(selected.description)}</p>}
        {selected.help && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-blue-50 p-3 text-sm">{fkPlainText(selected.help)}</p>}
        {!!selected.params.length && <dl className="mt-3 grid gap-2 text-sm">{selected.params.map((param, index) => <div key={index}><dt className="inline font-semibold">{param.key}: </dt><dd className="inline">{param.value}</dd></div>)}</dl>}
        <form className="mt-5 max-w-xl space-y-4" onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(async () => {
          const response = await prepareFKPurchase({ categoryId: Number(category), productId: selected.id, expectedPrice: selected.price, expectedCurrency: selected.currency,
            amount: String(form.get("amount") ?? ""), fields: selected.fields.map((field, index) => ({ key: field.key, value: String(form.get(`field-${index}`) ?? "") })),
          });
          if (response.error) setMessage(response.error); else if (response.data) { setReview(response.data); updateTransaction(response.data.transaction); }
        }); }}>
          {selected.fields.map((field, index) => <label key={field.key} className="block text-sm font-semibold">{field.label || field.placeholder || field.key}
            {field.values.length ? <select className={input} name={`field-${index}`} required><option value="">Choose an option</option>{field.values.map(value => <option key={value} value={value}>{value}</option>)}</select>
              : <input className={input} name={`field-${index}`} placeholder={field.placeholder} required maxLength={2000} autoComplete="off" />}
            {field.info.length > 0 && <span className="mt-1 block whitespace-pre-wrap text-xs font-normal text-slate-500">{field.info.join("\n")}</span>}
          </label>)}
          <label className="block text-sm font-semibold">Requested amount {selected.price ? "(only if required by the product instructions)" : `(${selected.currency})`}<input className={input} name="amount" type="number" step="0.00000001" min="0.00000001" required={!selected.price} placeholder={selected.price ? "Leave empty for a fixed-value code" : "Enter amount"} /></label>
          <button className={button} disabled={busy || !dashboard?.databaseReady}>{busy ? "Checking…" : "Validate & review purchase"}</button>
          <p className="text-xs text-slate-500">Validation does not purchase the product.</p>
        </form>
      </section>}
      {review && <section ref={purchaseSection} className="space-y-4 rounded-2xl border-2 border-blue-500 bg-white p-5" aria-label="Review purchase">
        <h2 className="text-xl font-bold">Review purchase</h2><p className="font-semibold">{review.transaction.summary.title}</p>
        <p>Listed supplier price: <strong>{money(review.transaction.summary.amount, review.transaction.summary.currency)}</strong></p>
        {review.transaction.summary.requestedAmount !== undefined && <p>Requested amount: <strong>{money(review.transaction.summary.requestedAmount, review.transaction.summary.currency)}</strong>. The amount charged follows FKWallet’s product terms.</p>}
        {review.fields.map(field => <p key={field.key} className="break-words text-sm"><strong>{field.key}:</strong> {field.value}</p>)}
        <p className="text-sm text-slate-600">One product will be purchased from your FKWallet balance. Review expires {date(review.transaction.expires_at)}.</p>
        <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void run(async () => {
          // A lost response must not leave a tempting second purchase button.
          const id = review.transaction.id;
          setReview(null); setSelected(null); setTab("history");
          const response = await confirmFKPurchase(id);
          if (response.error) setMessage(response.error); else if (response.data) { updateTransaction(response.data); setMessage(`Purchase submitted. FKWallet order ${response.data.provider_id}. Check its status for delivery details.`); }
          await refresh();
        })}>{busy ? "Submitting…" : "Confirm purchase with FKWallet balance"}</button>
          <button className={secondary} disabled={busy} onClick={() => void run(async () => { const response = await cancelFKReview(review.transaction.id); if (response.error) setMessage(response.error); else { setReview(null); await refresh(); } })}>Cancel review</button></div>
      </section>}
    </>}

    {tab === "imports" && <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Imported products</h2><button className={secondary} disabled={busy} onClick={() => void run(() => refreshImports(importPage))}>Refresh imports</button></div>
      <p className="mt-2 text-sm text-slate-600">Imports save drafts and supplier links. Customer delivery is not enabled by importing.</p>
      <div className="mt-4 space-y-3">{imports.products.map(product => <article key={product.productId} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><strong>{product.name}</strong><span className="text-xs font-bold">{product.status}</span></div><p className="mt-2 text-sm">Import markup: {product.markup}% · {date(product.createdAt)}</p><Link className="mt-3 inline-block text-sm font-bold text-blue-700 underline" href={`/admin/products/${product.productId}/edit/general`}>Review product</Link></article>)}</div>
      {!imports.products.length && <p className="mt-4 text-sm">No imported products to show.</p>}
      {imports.total > 20 && <div className="mt-4 flex items-center justify-between gap-3"><button className={secondary} disabled={busy || importPage <= 1} onClick={() => void run(() => refreshImports(importPage - 1))}>Previous imports</button><span className="text-sm">Page {importPage} of {Math.ceil(imports.total / 20)}</span><button className={secondary} disabled={busy || importPage * 20 >= imports.total} onClick={() => void run(() => refreshImports(importPage + 1))}>Next imports</button></div>}
    </section>}
    {tab === "history" && <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Recent purchases</h2><button className={secondary} disabled={busy} onClick={() => void run(refresh)}>Refresh list</button></div>
      <p className="mt-2 text-sm text-slate-500">Latest 20 requests. Check status to verify delivery against FKWallet’s purchase history.</p>
      <div className="mt-4 space-y-3">{dashboard?.transactions.map(transaction => <article key={transaction.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{transaction.summary.title}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{transaction.state === "READY" && Date.parse(transaction.expires_at) < Date.now() ? "REVIEW EXPIRED" : transaction.state}</span></div>
        <p className="text-sm">{money(transaction.summary.amount, transaction.summary.currency)} · {date(transaction.created_at)}</p>
        <p className="break-all text-xs text-slate-500">Request reference: igp-{transaction.id}{transaction.provider_id ? ` · FKWallet order: ${transaction.provider_id} · Provider status: ${transaction.provider_status}` : ""}</p>
        {(transaction.note || transaction.state === "SUBMITTING" || transaction.state === "UNKNOWN") && <p className="rounded-lg bg-amber-50 p-3 text-sm">{transaction.note || "This request may still be processing. Check FKWallet before creating another purchase."}</p>}
        {transaction.provider_id && <div className="flex flex-wrap gap-2"><button disabled={busy} className={secondary} onClick={() => void run(async () => { const response = await refreshFKPurchase(transaction.id); if (response.error) setMessage(response.error); else if (response.data) { updateTransaction(response.data.transaction); setResult({ id: transaction.id, value: response.data.result }); } })}>Check status &amp; result</button><button disabled={busy} className={secondary} onClick={() => void run(async () => { const response = await readFKPurchaseResult(transaction.id); if (response.error) setMessage(response.error); else if (response.data) setResult({ id: transaction.id, value: response.data }); })}>View saved result</button></div>}
        {result?.id === transaction.id && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex justify-between gap-2"><strong>FKWallet result · {result.value.deliveryStatus === "success" ? "Delivery confirmed" : result.value.deliveryStatus === "in_process" ? "Processing" : result.value.deliveryStatus && result.value.deliveryStatus !== "unknown" ? result.value.deliveryStatus : "Delivery not yet confirmed"}</strong><button className="underline" onClick={() => setResult(null)}>Hide</button></div>
          <p className="text-xs text-slate-600">Provider status number: {result.value.status}</p>
          {result.value.couponCode && <p className="break-all whitespace-pre-wrap"><strong>Code: </strong>{result.value.couponCode}</p>}
          {result.value.fields?.map((field, index) => <p className="break-all whitespace-pre-wrap" key={index}><strong>{field.key}: </strong>{field.value}</p>)}
          {result.value.esim && <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(result.value.esim, null, 2)}</pre>}
          {!result.value.couponCode && !result.value.fields?.length && !result.value.esim && <p>No code or additional delivery details have been returned yet.</p>}
        </div>}
      </article>)}{!dashboard?.transactions.length && <p className="py-6 text-sm text-slate-500">No purchases have been recorded here.</p>}</div>
    </section>}
  </div>;
}
