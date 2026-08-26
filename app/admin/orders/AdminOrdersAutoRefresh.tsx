"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminOrdersAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
