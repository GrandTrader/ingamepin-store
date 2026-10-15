"use client";

import { useOptimistic, useState, useTransition } from "react";

export default function ProductListSwitch({ enabled, label, caption, offColor = "bg-slate-300", save }: {
  enabled: boolean;
  label: string;
  caption?: string;
  offColor?: "bg-slate-300" | "bg-red-500";
  save: (enabled: boolean) => Promise<{ error?: string }>;
}) {
  const [value, setValue] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    if (pending) return;
    const next = !value;
    setError("");
    startTransition(async () => {
      setValue(next);
      try {
        const result = await save(next);
        if (result.error) setError(result.error);
      } catch {
        setError("Unable to save. Please try again.");
      }
    });
  }

  return (
    <div>
      <button type="button" role="switch" aria-checked={value} aria-busy={pending}
        aria-label={label} disabled={pending} onClick={toggle}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
        {/* Keep the compact track separate from the larger touch target. */}
        <span aria-hidden="true" data-product-switch-track
          className={"relative inline-block h-[18px] w-[32px] shrink-0 rounded-full transition-colors " + (value ? "bg-emerald-500" : offColor)}>
          <span className={"absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] " + (value ? "left-[16px]" : "left-[2px]")} />
        </span>
        {caption && <span className="whitespace-nowrap">{caption}</span>}
      </button>
      {error && <p role="alert" className="max-w-48 text-left text-xs text-red-600">{error}</p>}
    </div>
  );
}
