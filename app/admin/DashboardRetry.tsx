"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
      className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-60">
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
