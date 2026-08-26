"use client";

import { useActionState, useState } from "react";

import { createBulkApiKey, type CreateBulkApiKeyState } from "./actions";

const initialState: CreateBulkApiKeyState = {};

export default function BulkApiKeyCreator() {
  const [state, action, pending] = useActionState(createBulkApiKey, initialState);
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    if (!state.apiKey) return;
    await navigator.clipboard.writeText(state.apiKey);
    setCopied(true);
  }

  if (state.apiKey) {
    return (
      <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
        <p className="font-black text-emerald-800">API key created for {state.partnerName}</p>
        <p className="mt-2 text-sm font-bold text-red-700">Copy it now. This key will never be shown again.</p>
        <code className="mt-4 block break-all rounded-xl bg-slate-950 p-4 text-sm text-white">{state.apiKey}</code>
        <button type="button" onClick={copyKey} className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">
          {copied ? "Copied" : "Copy API key"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold text-slate-700">Partner name
        <input name="name" required minLength={2} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3" placeholder="Company name" />
      </label>
      <label className="text-sm font-bold text-slate-700">Contact email
        <input name="contactEmail" type="email" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3" placeholder="partner@example.com" />
      </label>
      {state.error && <p className="text-sm font-bold text-red-600 sm:col-span-2">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-50 sm:col-span-2 sm:w-fit">
        {pending ? "Creating..." : "Generate customer API key"}
      </button>
    </form>
  );
}
