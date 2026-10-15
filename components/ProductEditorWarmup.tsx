"use client";
import { useEffect } from "react";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useRouter } from "next/navigation";

// Only prepare two common local tabs. External supplier tabs wait for intent.
// No invalidation loop: a save must not trigger another wave of database reads.
export default function ProductEditorWarmup({ hrefs }: { hrefs: string[] }) {
  const router = useRouter();
  const routes = hrefs.slice(0, 2).join("\n");
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    const timers = routes.split("\n").filter(Boolean).map((href, index) => setTimeout(() => {
      if (document.visibilityState === "visible") router.prefetch(href, { kind: PrefetchKind.FULL });
    }, 1000 + index * 500));
    return () => timers.forEach(clearTimeout);
  }, [router, routes]);
  return null;
}
