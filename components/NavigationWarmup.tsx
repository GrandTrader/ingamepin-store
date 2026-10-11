"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { canPrefetchPage } from "@/lib/navigation-prefetch";

export default function NavigationWarmup() {
  const router = useRouter();
  const pathname = usePathname();
  const warmed = useRef(new Map<string, number>());
  useEffect(() => {
    if (/^\/(admin|account|checkout|seller|vendor|business)(\/|$)/.test(pathname)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    let stopped = false;
    let automaticCount = 0;
    let intentTimer: ReturnType<typeof setTimeout>;
    let scanTimer: ReturnType<typeof setTimeout>;
    let queueTimer: ReturnType<typeof setTimeout>;
    const queue = new Set<HTMLAnchorElement>();
    const observed = new WeakSet<HTMLAnchorElement>();

    function eligible(anchor: HTMLAnchorElement) {
      if (anchor.hasAttribute("download") || anchor.dataset.storePrefetch === "off" || (anchor.target && anchor.target !== "_self")) return false;
      return canPrefetchPage(anchor.href, location.origin) && new URL(anchor.href).pathname !== pathname;
    }
    function visible(anchor: HTMLAnchorElement) {
      const rect = anchor.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
    }
    function warm(anchor: HTMLAnchorElement) {
      if (stopped || document.visibilityState !== "visible" || !eligible(anchor)) return false;
      const now = Date.now();
      for (const [key, expires] of warmed.current) if (expires <= now) warmed.current.delete(key);
      const href = new URL(anchor.href).pathname;
      if (warmed.current.has(href)) return false;
      const expiry = now + 30000;
      warmed.current.set(href, expiry);
      // Match Next's 30-second full-prefetch lifetime. Never persist personalized pages.
      // Intent remains available even after the automatic viewport budget is used.
      if (warmed.current.size > 40) warmed.current.delete(warmed.current.keys().next().value!);
      router.prefetch(href, {
        kind: PrefetchKind.FULL,
        onInvalidate: () => {
          if (warmed.current.get(href) === expiry) warmed.current.delete(href);
        },
      });
      return true;
    }
    function drain() {
      if (stopped || automaticCount >= 6 || document.visibilityState !== "visible") return;
      for (const anchor of queue) {
        queue.delete(anchor);
        if (!anchor.isConnected || !visible(anchor) || !warm(anchor)) continue;
        automaticCount++;
        break;
      }
      if (queue.size && automaticCount < 6) queueTimer = setTimeout(drain, 300);
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        const anchor = entry.target as HTMLAnchorElement;
        if (entry.isIntersecting) queue.add(anchor);
        else queue.delete(anchor);
      }
      clearTimeout(queueTimer);
      queueTimer = setTimeout(drain, 150);
    });
    function scan() {
      if (stopped || automaticCount >= 6) return;
      // The header can render before streamed products. Reserve background work for
      // page content; header links still prepare immediately on hover, focus or touch.
      const anchors = document.querySelectorAll<HTMLAnchorElement>("main a[href], footer a[href]");
      for (const anchor of anchors) {
        if (!eligible(anchor) || observed.has(anchor)) continue;
        observed.add(anchor);
        observer?.observe(anchor);
        if (visible(anchor)) queue.add(anchor);
      }
      clearTimeout(queueTimer);
      queueTimer = setTimeout(drain, 150);
    }
    function scheduleScan() {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, 150);
    }
    function intent(event: Event) {
      if (event instanceof KeyboardEvent && !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a") ?? (target?.getAttribute("aria-activedescendant") ? document.getElementById(target.getAttribute("aria-activedescendant")!) : null);
      if (!(anchor instanceof HTMLAnchorElement)) return;
      clearTimeout(intentTimer);
      if (event.type === "pointerover") intentTimer = setTimeout(() => warm(anchor), 65);
      else warm(anchor);
    }
    const mutationObserver = new MutationObserver(scheduleScan);
    const idleTimer = setTimeout(() => { scan(); mutationObserver.observe(document.body, { childList: true, subtree: true }); }, 450);
    document.addEventListener("pointerover", intent, { passive: true });
    document.addEventListener("pointerout", cancelIntent, { passive: true });
    document.addEventListener("focusin", intent);
    document.addEventListener("touchstart", intent, { passive: true });
    document.addEventListener("keyup", intent);
    document.addEventListener("visibilitychange", scheduleScan);
    function cancelIntent() { clearTimeout(intentTimer); }
    return () => {
      stopped = true;
      clearTimeout(idleTimer); clearTimeout(intentTimer); clearTimeout(scanTimer); clearTimeout(queueTimer);
      observer?.disconnect(); mutationObserver.disconnect(); queue.clear();
      document.removeEventListener("pointerover", intent);
      document.removeEventListener("pointerout", cancelIntent);
      document.removeEventListener("focusin", intent);
      document.removeEventListener("touchstart", intent);
      document.removeEventListener("keyup", intent);
      document.removeEventListener("visibilitychange", scheduleScan);
    };
  }, [pathname, router]);
  return null;
}
