"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useProductEditorNavigation } from "./ProductEditorNavigation";
import styles from "./ProductEditorDialog.module.css";

export default function ProductEditorDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
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
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className={styles.header}>
        <h2 id="product-editor-title">Edit product</h2>
        <button type="button" onClick={close} aria-label="Close product editor" className={styles.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div ref={content} className={styles.content}>{children}</div>
    </dialog>
  );
}
