"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setProductChannel } from "./channel-actions";

function ChannelSwitch({ id, name, channel, enabled }: {
  id: string;
  name: string;
  channel: "business" | "retail";
  enabled: boolean;
}) {
  const [value, setValue] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const label = channel === "business" ? "Business portal" : "Retail site";

  function toggle() {
    setError("");
    startTransition(async () => {
      setValue(!value);
      try {
        const result = await setProductChannel(id, channel, !value);
        if (result.error) setError(result.error);
      } catch {
        setError("Unable to save. Please try again.");
      }
    });
  }

  return (
    <div>
      <button type="button" role="switch" aria-checked={value}
        aria-label={`${label} for ${name}`} disabled={pending} onClick={toggle}
        className="flex items-center gap-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
        <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full ${value ? "bg-emerald-500" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${value ? "left-[18px]" : "left-0.5"}`} />
        </span>
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {error && <p role="alert" className="max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ProductChannelSwitches({ id, name, business, retail }: {
  id: string;
  name: string;
  business: boolean;
  retail: boolean;
}) {
  return (
    <div className="grid gap-1">
      <ChannelSwitch id={id} name={name} channel="business" enabled={business} />
      <ChannelSwitch id={id} name={name} channel="retail" enabled={retail} />
    </div>
  );
}
