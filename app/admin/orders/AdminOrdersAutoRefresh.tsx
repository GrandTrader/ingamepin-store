"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export default function AdminOrdersAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => { refreshing.current = pending; }, [pending]);
  useEffect(() => {
    function refresh() {
      const focused = document.activeElement;
      if (document.visibilityState !== "visible" || refreshing.current || focused?.matches("input,textarea,select,[contenteditable=true]")) return;
      refreshing.current = true;
      startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  return null;
}
