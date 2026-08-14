"use client";

import { useState } from "react";

type Option = { id: string; name: string; denomination: number; currency: string; sellingPrice: number; isActive: boolean; isInStock: boolean };
const currencies = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "CAD", "AUD", "JPY", "SGD"];

export default function ProductOptionsEditor({ initialOptions, productName }: { initialOptions: Option[]; productName: string }) {
  const [options, setOptions] = useState(initialOptions);
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  function update(index: number, values: Partial<Option>) { setOptions((current) => current.map((option, itemIndex) => itemIndex === index ? { ...option, ...values } : option)); }
  function add() { setOptions((current) => [...current, { id: "", name: "", denomination: 1, currency: "INR", sellingPrice: 0, isActive: true, isInStock: true }]); setSelected(options.length); }
  function remove(index: number) { if (options.length > 1) { setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSelected(0); } }
  function drop(targetIndex: number) { if (dragging === null || dragging === targetIndex) return; setOptions((current) => { const next = [...current]; const [moved] = next.splice(dragging, 1); next.splice(targetIndex, 0, moved); return next; }); setSelected(targetIndex); setDragging(null); }

  return <><input type="hidden" name="options" value={JSON.stringify(options)} />
    <div className="grid gap-5 xl:grid-cols-[190px_1fr_280px]">
      <aside className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Options</p><div className="grid gap-1">{options.map((option, index) => <button key={option.id || `new-${index}`} type="button" onClick={() => setSelected(index)} className={`rounded-lg px-3 py-3 text-left text-sm font-bold ${selected === index ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{option.name || `New option ${index + 1}`}</button>)}</div><button type="button" onClick={add} className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 font-bold text-blue-600">+ Add option</button></aside>

      <section className="min-w-0"><div className="mb-5"><h2 className="text-xl font-black">Denomination options</h2><p className="mt-1 text-sm text-slate-500">Edit the customer-visible options and selling prices.</p></div><div className="overflow-x-auto"><div className="min-w-[650px]">
        <div className="grid grid-cols-[34px_1.6fr_110px_100px_120px_80px_100px_42px] gap-3 border-b border-slate-200 px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500"><span></span><span>Option name</span><span>Value</span><span>Currency</span><span>Price USD</span><span>Default</span><span className="sticky right-[54px] z-20 rounded-md bg-slate-100 px-2 py-1 text-center shadow-sm">In stock</span><span></span></div>
        {options.map((option, index) => <div key={option.id || `row-${index}`} draggable onDragStart={() => setDragging(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(index)} className={`grid grid-cols-[34px_1.6fr_110px_100px_120px_80px_100px_42px] items-center gap-3 border-b border-slate-200 px-2 py-3 ${selected === index ? "bg-blue-50" : ""}`} onClick={() => setSelected(index)}>
          <button type="button" aria-label={`Drag ${option.name}`} className="cursor-grab rounded border border-slate-200 bg-white px-2 py-2 text-slate-500 active:cursor-grabbing">⋮⋮</button>
          <input value={option.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="1000 Rupees" className="rounded-lg border border-slate-200 bg-white px-3 py-2" />
          <input type="number" min="1" step="1" value={option.denomination} onChange={(event) => update(index, { denomination: Number(event.target.value) })} className="rounded-lg border border-slate-200 bg-white px-3 py-2" />
          <select value={option.currency} onChange={(event) => update(index, { currency: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2">{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>
          <input type="number" min="0" step="0.01" value={option.sellingPrice} onChange={(event) => update(index, { sellingPrice: Number(event.target.value) })} className="rounded-lg border border-slate-200 bg-white px-3 py-2" />
          <div className="flex items-center justify-center"><input type="radio" name="default_preview" checked={selected === index} onChange={() => setSelected(index)} aria-label={`Preview ${option.name}`} /></div>
          <label className={`sticky right-[54px] z-20 flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm ${option.isInStock ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`} onClick={(event) => event.stopPropagation()}>
            <input type="checkbox" checked={option.isInStock} onChange={(event) => update(index, { isInStock: event.target.checked })} className="peer sr-only" />
            <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-slate-400 bg-white text-sm font-black text-transparent shadow-sm transition peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2" aria-hidden="true">✓</span>
            <span className={option.isInStock ? "text-emerald-700" : "text-red-600"}>{option.isInStock ? "In stock" : "Out of stock"}</span>
          </label>
          <button type="button" onClick={() => remove(index)} disabled={options.length === 1} aria-label={`Remove ${option.name}`} className="rounded-lg bg-blue-600 px-3 py-2 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">−</button>
        </div>)}
        <div className="flex justify-end px-2 pt-3"><button type="button" onClick={add} className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-black text-white">+</button></div>
      </div></div></section>

      <aside className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"><p className="text-sm font-black">Preview payment form</p><div className="mt-4 rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-slate-700">{productName}</p><div className="mt-4 grid gap-3">{options.filter((option) => option.isActive).map((option, index) => <label key={option.id || `preview-${index}`} className={`flex items-center gap-2 text-sm ${option.isInStock ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}><input type="radio" name="preview_option" disabled={!option.isInStock} checked={option.isInStock && selected === options.indexOf(option)} onChange={() => setSelected(options.indexOf(option))} /><span>{option.name || `${option.denomination} ${option.currency}`}</span><span className="ml-auto text-right"><span className="block font-bold">${option.sellingPrice.toFixed(2)}</span>{!option.isInStock && <span className="text-xs font-bold text-red-600">Out of stock</span>}</span></label>)}</div><button type="button" className="mt-5 w-full rounded-lg bg-slate-300 px-4 py-3 font-black text-white">BUY</button></div></aside>
    </div>
  </>;
}
