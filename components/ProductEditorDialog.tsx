"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useProductEditorNavigation } from "./ProductEditorNavigation";
import styles from "./ProductEditorDialog.module.css";

function isBackdrop(event: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
  if (event.target !== event.currentTarget) return false;
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}

export default function ProductEditorDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const backdropPress = useRef(false);
  const pathname = usePathname();
  const positions = useRef(new Map<string, { top: number; tabs: number }>());
  const activePath = useRef(pathname);
  const lastTabs = useRef(0);
  const restoring = useRef(false);
  const { close } = useProductEditorNavigation();

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.documentElement.style.overflow;
    element?.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      element?.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  function rememberPosition() {
    if (!content.current || restoring.current) return;
    const tabs = content.current.querySelector<HTMLElement>("[data-product-edit-tabs]");
    lastTabs.current = tabs?.scrollLeft ?? lastTabs.current;
    positions.current.set(activePath.current, { top: content.current.scrollTop, tabs: lastTabs.current });
  }

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    restoring.current = true;
    const position = positions.current.get(pathname);
    activePath.current = pathname;
    element.scrollTo({ top: position?.top ?? 0, behavior: "instant" });
    const tabs = element.querySelector<HTMLElement>("[data-product-edit-tabs]");
    if (tabs) tabs.scrollLeft = lastTabs.current;
    restoring.current = false;
  }, [pathname, children]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="product-editor-title"
      onPointerDown={(event) => { backdropPress.current = event.button === 0 && isBackdrop(event); }}
      onPointerCancel={() => { backdropPress.current = false; }}
      onClick={(event) => {
        const dismiss = backdropPress.current && isBackdrop(event);
        backdropPress.current = false;
        if (dismiss) close();
      }}
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className={styles.header}>
        <h2 id="product-editor-title">Edit product</h2>
        <button type="button" onClick={close} aria-label="Close product editor" className={styles.close}>
          <span>Close</span><span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div ref={content} className={styles.content} onScrollCapture={rememberPosition} onClickCapture={rememberPosition} onSubmitCapture={rememberPosition}>{children}</div>
    </dialog>
  );
}
