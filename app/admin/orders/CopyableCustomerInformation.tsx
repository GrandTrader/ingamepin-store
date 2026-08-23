"use client";

import { useState } from "react";

type CustomerField = {
  fieldId: string;
  label: string;
  value: string;
};

export default function CopyableCustomerInformation({
  playerId,
  fields,
}: {
  playerId?: string | null;
  fields: CustomerField[];
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1500);
  }

  const values = [
    ...(playerId ? [{ fieldId: "player-id", label: "Player ID", value: playerId }] : []),
    ...fields,
  ];

  return values.map((field) => (
    <div key={field.fieldId} className="mt-2 flex max-w-xl items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
      <span className="min-w-0 flex-1 break-all">
        {field.label}: <strong>{field.value}</strong>
      </span>
      <button
        type="button"
        onClick={() => copyValue(field.fieldId, field.value)}
        className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 font-black text-white hover:bg-blue-500"
      >
        {copied === field.fieldId ? "Copied" : "Copy"}
      </button>
    </div>
  ));
}
