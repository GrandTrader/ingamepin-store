"use client";

import { useEffect, useState } from "react";

const FORM_ID = "bulk-delete-products";

function getProductCheckboxes() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[form="${FORM_ID}"][name="product_ids"]`,
    ),
  );
}

export function SelectAllProductsCheckbox() {
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    const update = () => {
      const checkboxes = getProductCheckboxes();
      setAllSelected(
        checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked),
      );
    };

    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, []);

  return (
    <input
      type="checkbox"
      checked={allSelected}
      aria-label="Select all products on this page"
      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
      onChange={(event) => {
        getProductCheckboxes().forEach((checkbox) => {
          checkbox.checked = event.target.checked;
        });
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

export function DeleteSelectedProductsButton() {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const update = () => {
      setSelectedCount(
        getProductCheckboxes().filter((checkbox) => checkbox.checked).length,
      );
    };

    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, []);

  return (
    <button
      type="submit"
      form={FORM_ID}
      disabled={selectedCount === 0}
      onClick={(event) => {
        if (
          !window.confirm(
            `Permanently delete ${selectedCount} selected product${selectedCount === 1 ? "" : "s"}? Products with order history will not be deleted.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
    >
      <span aria-hidden="true">&#128465;</span>
      Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
    </button>
  );
}
