"use client";
import { useState, type ReactNode } from "react";

export default function CollapsibleAdminSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return <details onToggle={event => { const open = event.currentTarget.open; setExpanded(open); if (open) setHasOpened(true); }} className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
    <summary aria-label={title} className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-blue-600 sm:p-6 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      <span aria-hidden="true" className="shrink-0 rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">{expanded ? "Hide −" : "Show +"}</span>
    </summary>
    {hasOpened && <div className="border-t border-slate-100 p-4 sm:p-6">{children}</div>}
  </details>;
}
