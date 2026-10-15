"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSelectedLayoutSegment, useSelectedLayoutSegments } from "next/navigation";

type ReturnPosition = { url: string; scroll: number; trigger: string | null };
const EditorNavigation = createContext<{ close: () => void; modal: boolean }>({ close: () => {}, modal: false });
export function useProductEditorNavigation() { return useContext(EditorNavigation); }

export default function ProductEditorNavigation({ children, editor }: { children: ReactNode; editor: ReactNode }) {
  const backgroundSegment = useSelectedLayoutSegment();
  const editorSegments = useSelectedLayoutSegments("editor").filter(segment => !segment.startsWith("("));
  const modal = backgroundSegment === null;
  const intercepted = editorSegments.length > 1 && editorSegments[1] === "edit";
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
        (document.querySelector<HTMLElement>("[data-admin-scroll]") ?? window).scrollTo({ top: scroll, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, router]);

  return (
    <EditorNavigation.Provider value={{ close, modal }}>
      <div onClickCapture={(event) => {
        if (pathname !== "/admin/products" || !(event.target instanceof Element)) return;
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (!link || !/^\/admin\/products\/[^/]+\/edit(?:\/|$)/.test(link.getAttribute("href") ?? "")) return;
        returnPosition.current = { url: window.location.pathname + window.location.search, scroll: document.querySelector<HTMLElement>("[data-admin-scroll]")?.scrollTop ?? window.scrollY, trigger: link.getAttribute("href") };
      }}>{!modal && intercepted ? editor : <>{children}{editor}</>}</div>
    </EditorNavigation.Provider>
  );
}
