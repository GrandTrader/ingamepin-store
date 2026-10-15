"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/app/admin/AdminSidebar";
import { AdminFrameContext } from "./AdminFrameContext";
import styles from "./AdminFrame.module.css";

export default function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const section = /^\/admin\/products\/[^/]+\/edit(?:\/|$)/.test(pathname) ? "/admin/products" : pathname;
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const saved = positions.current;
    element.scrollTop = saved.get(section) ?? 0;
    return () => { saved.set(section, element.scrollTop); };
  }, [section]);
  const [walletCount, setWalletCount] = useState(0);
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return <>{children}</>;
  return <AdminFrameContext.Provider value={{ walletCount, setWalletCount }}>
    <div className={styles.frame + " admin-responsive-shell"} data-admin-frame>
      <a className={styles.skip} href="#admin-page-content">Skip to content</a>
      <AdminSidebar persistent walletCount={walletCount} />
      <div ref={scroll} id="admin-page-content" data-admin-scroll tabIndex={-1} className={styles.content}>{children}</div>
    </div>
  </AdminFrameContext.Provider>;
}
