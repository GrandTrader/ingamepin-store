"use client";

import { useState } from "react";

export type ProductCustomerField = {
  id?: string;
  label: string;
  placeholder: string;
  fieldType: "TEXT" | "EMAIL" | "NUMBER" | "TEXTAREA";
  isRequired: boolean;
};

type Props = {
  initialFields?: ProductCustomerField[];
};

const emptyField = (): ProductCustomerField => ({
  label: "",
  placeholder: "",
  fieldType: "TEXT",
  isRequired: false,
});

export default function ProductCustomerFieldsEditor({
  initialFields = [],
}: Props) {
  const [fields, setFields] = useState<ProductCustomerField[]>(initialFields);

  function updateField(
    index: number,
    patch: Partial<ProductCustomerField>,
  ) {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= fields.length) return;
    setFields((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <section
      id="customer-information"
      className="scroll-mt-48 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-xl font-black">Customer information fields</h2>
      <p className="mt-1 text-sm text-slate-500">
        Add only the information this product requires before quantity selection.
      </p>

      <div className="mt-5 grid gap-3">
        {fields.map((field, index) => (
          <div
            key={field.id ?? ("new-" + index)}
            className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[auto_1fr_1fr_180px_auto_auto]"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded-lg border bg-white px-2 py-2 text-xs disabled:opacity-30"
                aria-label="Move field up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === fields.length - 1}
                className="rounded-lg border bg-white px-2 py-2 text-xs disabled:opacity-30"
                aria-label="Move field down"
              >
                ↓
              </button>
            </div>

            <input type="hidden" name="customer_field_id" value={field.id ?? ""} />
            <input
              name="customer_field_label"
              required
              maxLength={80}
              value={field.label}
              onChange={(event) => updateField(index, { label: event.target.value })}
              placeholder="Field name, e.g. Player ID"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
            />
            <input
              name="customer_field_placeholder"
              maxLength={150}
              value={field.placeholder}
              onChange={(event) =>
                updateField(index, { placeholder: event.target.value })
              }
              placeholder="Placeholder shown to customer"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
            />
            <select
              name="customer_field_type"
              value={field.fieldType}
              onChange={(event) =>
                updateField(index, {
                  fieldType: event.target.value as ProductCustomerField["fieldType"],
                })
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="TEXT">Text</option>
              <option value="EMAIL">Email</option>
              <option value="NUMBER">Number</option>
              <option value="TEXTAREA">Long text</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                name="customer_field_required"
                type="checkbox"
                value={String(index)}
                checked={field.isRequired}
                onChange={(event) =>
                  updateField(index, { isRequired: event.target.checked })
                }
                className="h-5 w-5 accent-blue-600"
              />
              <span className="text-sm font-bold">Required</span>
            </label>
            <button
              type="button"
              onClick={() =>
                setFields((current) =>
                  current.filter((_, fieldIndex) => fieldIndex !== index),
                )
              }
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setFields((current) => [...current, emptyField()])}
        disabled={fields.length >= 20}
        className="mt-4 rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-40"
      >
        + Add field
      </button>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
        No permanent delivery email field. Add an Email field only when this
        product needs one.
      </div>
    </section>
  );
}
