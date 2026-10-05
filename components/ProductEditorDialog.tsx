"use client";

import { useEffect, useRef, type ReactNode } from "react";
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

  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [pathname]);

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
      <div ref={content} className={styles.content}>{children}</div>
    </dialog>
  );
}
