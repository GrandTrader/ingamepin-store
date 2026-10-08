"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateSelectedProducts, type BulkActivationResult } from "./bulk-actions";

const FORM_ID = "bulk-delete-products";

function getProductCheckboxes() {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_ID}"][name="product_ids"]`));
}

export function SelectAllProductsCheckbox({ selectionKey = "" }: { selectionKey?: string }) {
  const [allSelected, setAllSelected] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => {
      const checkboxes = getProductCheckboxes();
      const count = checkboxes.filter(checkbox => checkbox.checked).length;
      setAllSelected(checkboxes.length > 0 && count === checkboxes.length);
      if (input.current) input.current.indeterminate = count > 0 && count < checkboxes.length;
    };
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, [selectionKey]);

  return <input ref={input} type="checkbox" checked={allSelected} aria-label="Select all products on this page"
    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
    onChange={event => {
      getProductCheckboxes().forEach(checkbox => { checkbox.checked = event.target.checked; });
      document.dispatchEvent(new Event("change"));
    }} />;
}

export function SelectedProductActions({ selectionKey = "" }: { selectionKey?: string }) {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkActivationResult | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const update = () => setSelectedCount(getProductCheckboxes().filter(checkbox => checkbox.checked).length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, [selectionKey]);

  function activate() {
    if (lock.current) return;
    const selected = getProductCheckboxes().filter(checkbox => checkbox.checked);
    if (!selected.length || !window.confirm(`Activate ${selected.length} selected product${selected.length === 1 ? "" : "s"}? Ready products will be published to their enabled sales channels. Incomplete products will be skipped.`)) return;
    const form = new FormData();
    selected.forEach(checkbox => form.append("product_ids", checkbox.value));
    lock.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        const saved = await activateSelectedProducts(form);
        setResult(saved);
        const activated = new Set(saved.activated);
        getProductCheckboxes().forEach(checkbox => { if (activated.has(checkbox.value)) checkbox.checked = false; });
        document.dispatchEvent(new Event("change"));
        if (saved.activated.length) router.refresh();
      } catch {
        setResult({ activated: [], alreadyActive: 0, skipped: [], error: "Unable to confirm the result. Refresh this page to check product statuses before trying again." });
      } finally { lock.current = false; }
    });
  }

  return <div className="w-full space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold text-slate-500">Select products on this page to activate or delete them. Up to 20 at a time.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || selectedCount === 0} onClick={activate}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? "Activating…" : `Activate selected${selectedCount ? ` (${selectedCount})` : ""}`}
        </button>
        <button type="submit" form={FORM_ID} disabled={pending || selectedCount === 0}
          onClick={event => {
            if (lock.current || !window.confirm(`Permanently delete ${selectedCount} selected product${selectedCount === 1 ? "" : "s"}? Products with order history will not be deleted.`)) event.preventDefault();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
          <span aria-hidden="true">&#128465;</span>Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>
    </div>
    {result && <div role={result.error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${result.error || result.skipped.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {result.error || <>
        <p className="font-bold">{result.activated.length} product{result.activated.length === 1 ? "" : "s"} activated.{result.alreadyActive > 0 && ` ${result.alreadyActive} already active.`}{result.skipped.length > 0 && ` ${result.skipped.length} skipped.`}</p>
        {result.skipped.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{result.skipped.map(product => <li key={product.id}><strong>{product.name}:</strong> {product.reason}</li>)}</ul>}
      </>}
    </div>}
  </div>;
}
