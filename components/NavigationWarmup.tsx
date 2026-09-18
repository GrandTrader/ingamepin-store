"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canPrefetchPage } from "@/lib/navigation-prefetch";

export default function NavigationWarmup() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(admin|account|checkout|seller|vendor)(\/|$)/.test(pathname)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    const warmed = new Map<string, number>();
    let stopped = false;
    let intentTimer: ReturnType<typeof setTimeout>;
    function warm(anchor: HTMLAnchorElement) {
      if (stopped || document.visibilityState !== "visible" || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      for (const [key, expires] of warmed) if (expires <= Date.now()) warmed.delete(key);
      if (!canPrefetchPage(anchor.href, location.origin) || warmed.size >= 12) return;
      const href = new URL(anchor.href).pathname;
      if (href === pathname || warmed.has(href)) return;
      warmed.set(href, Date.now() + 30000);
      router.prefetch(href);
    }
    function intent(event: Event) {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      clearTimeout(intentTimer);
      if (event.type === "touchstart" || event.type === "focusin") warm(anchor);
      else intentTimer = setTimeout(() => warm(anchor), 100);
    }
    function warmVisible() {
      let count = 0;
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (!canPrefetchPage(anchor.href, location.origin)) continue;
        const rect = anchor.getBoundingClientRect();
        if (rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0) {
          const before = warmed.size;
          warm(anchor);
          if (warmed.size > before && ++count === 2) break;
        }
      }
    }
    const idleTimer = setTimeout(warmVisible, 1200);
    document.addEventListener("pointerover", intent, { passive: true });
    document.addEventListener("focusin", intent);
    document.addEventListener("touchstart", intent, { passive: true });
    return () => {
      stopped = true; clearTimeout(idleTimer); clearTimeout(intentTimer);
      document.removeEventListener("pointerover", intent);
      document.removeEventListener("focusin", intent);
      document.removeEventListener("touchstart", intent);
    };
  }, [pathname, router]);
  return null;
}
