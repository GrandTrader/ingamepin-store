"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type ReturnPosition = { url: string; scroll: number; trigger: string | null };
const EditorNavigation = createContext<{ close: () => void }>({ close: () => {} });
export function useProductEditorNavigation() { return useContext(EditorNavigation); }

export default function ProductEditorNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const returnPosition = useRef<ReturnPosition>({ url: "/admin/products", scroll: 0, trigger: null });
  const returning = useRef(false);
  const close = useCallback(() => {
    returning.current = true;
    router.replace(returnPosition.current.url, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (pathname !== "/admin/products") return;
    const restore = returning.current;
    returning.current = false;
    if (restore) router.refresh();
    const frame = requestAnimationFrame(() => {
      if (restore) {
        const { scroll, trigger } = returnPosition.current;
        const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((element) => element.getAttribute("href") === trigger);
        link?.focus({ preventScroll: true });
        window.scrollTo({ top: scroll, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, router]);

  return (
    <EditorNavigation.Provider value={{ close }}>
      <div onClickCapture={(event) => {
        if (pathname !== "/admin/products" || !(event.target instanceof Element)) return;
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (!link || !/^\/admin\/products\/[^/]+\/edit(?:\/|$)/.test(link.getAttribute("href") ?? "")) return;
        returnPosition.current = { url: window.location.pathname + window.location.search, scroll: window.scrollY, trigger: link.getAttribute("href") };
      }}>{children}</div>
    </EditorNavigation.Provider>
  );
}
