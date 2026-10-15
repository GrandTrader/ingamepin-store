"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./ProductEditorTabBar.module.css";

type TabPosition = { productId: string; left: number };
const TabsHost = createContext<{
  target: HTMLDivElement | null;
  getPosition: (productId: string) => number;
  savePosition: (productId: string, left: number) => void;
} | null>(null);

// Keep the toolbar outside the form's scroll container in either editor layout.
export function ProductEditorTabsHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const position = useRef<TabPosition>({ productId: "", left: 0 });
  const value = useMemo(() => ({
    target,
    getPosition: (productId: string) => position.current.productId === productId ? position.current.left : 0,
    savePosition: (productId: string, left: number) => { position.current = { productId, left }; },
  }), [target]);
  return (
    <TabsHost.Provider value={value}>
      <div ref={setTarget} className={styles.dock} data-product-tabs-dock />
      {children}
    </TabsHost.Provider>
  );
}

export default function ProductEditorTabBar({ productId, children }: { productId: string; children: ReactNode }) {
  const host = useContext(TabsHost);
  const toolbar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const nav = toolbar.current?.querySelector<HTMLElement>("[data-product-edit-tabs]");
    if (!host || !nav) return;
    nav.scrollLeft = host.getPosition(productId);
    host.savePosition(productId, nav.scrollLeft);
    // Capture the final position even when navigation replaces this tab.
    return () => { host.savePosition(productId, nav.scrollLeft); };
  }, [host, productId, children]);

  function rememberPosition() {
    const nav = toolbar.current?.querySelector<HTMLElement>("[data-product-edit-tabs]");
    if (host && nav) host.savePosition(productId, nav.scrollLeft);
  }

  const bar = (
    <div ref={toolbar} className={styles.bar} onScrollCapture={rememberPosition} onClickCapture={rememberPosition}>
      {children}
    </div>
  );
  return (
    <>
      <span hidden data-product-tabs-placeholder />
      {host?.target ? createPortal(bar, host.target) : bar}
    </>
  );
}
