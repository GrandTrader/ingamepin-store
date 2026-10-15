"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useProductEditorNavigation } from "./ProductEditorNavigation";
import styles from "./ProductEditorDialog.module.css";
import { ProductEditorTabsHost } from "./ProductEditorTabBar";

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
  const positions = useRef(new Map<string, number>());
  const activePath = useRef(pathname);
  const restoring = useRef(false);
  const { close, modal } = useProductEditorNavigation();

  useEffect(() => {
    if (!modal) return;
    const element = dialog.current;
    const previousOverflow = document.documentElement.style.overflow;
    element?.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      element?.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [modal]);

  function rememberPosition() {
    if (!content.current || restoring.current) return;
    positions.current.set(activePath.current, content.current.scrollTop);
  }

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    restoring.current = true;
    const position = positions.current.get(pathname);
    activePath.current = pathname;
    element.scrollTo({ top: position ?? 0, behavior: "instant" });
    restoring.current = false;
  }, [pathname, children]);

  if (!modal) return children;

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
      <ProductEditorTabsHost>
        <div ref={content} className={styles.content} onScrollCapture={rememberPosition} onClickCapture={rememberPosition} onSubmitCapture={rememberPosition}>{children}</div>
      </ProductEditorTabsHost>
    </dialog>
  );
}
