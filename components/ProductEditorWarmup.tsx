"use client";

import { useEffect } from "react";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useRouter, useSearchParams } from "next/navigation";

// Prepare all tabs of this product, including tabs outside the horizontal viewport.
// Keep invalidated tabs warm only while this editor is mounted and visible.
export default function ProductEditorWarmup({ hrefs }: { hrefs: string[] }) {
  const router = useRouter();
  const search = useSearchParams().toString();
  const routes = hrefs.join("\n");
  useEffect(() => {
    let stopped = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const scheduled = new Set<string>();
    function schedule(href: string, delay: number) {
      if (stopped || scheduled.has(href)) return;
      scheduled.add(href);
      const timer = setTimeout(() => {
        timers.delete(timer);
        scheduled.delete(href);
        if (stopped || document.visibilityState !== "visible") return;
        router.prefetch(href, { kind: PrefetchKind.FULL, onInvalidate: () => schedule(href, 500) });
      }, delay);
      timers.add(timer);
    }
    function warm() {
      if (document.visibilityState === "visible") routes.split("\n").forEach((href, index) => schedule(href, index * 150));
    }
    warm();
    document.addEventListener("visibilitychange", warm);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", warm);
    };
  }, [router, routes, search]);
  return null;
}
