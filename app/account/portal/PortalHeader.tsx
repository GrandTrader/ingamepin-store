"use client";

import Link from "@/components/NavigationLink";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import s from "./Portal.module.css";

export default function PortalHeader({ name, logout, children }: { name: string; logout: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const home = path === "/account/portal";
  const title = path.endsWith("/new") ? "New order" : path.includes("/api-access") ? "API access" : path.includes("/api-docs") ? "API documentation" : path.includes("/statement") ? "Wallet statement" : path.includes("/wallet") ? "Add funds" : path.includes("/orders/") ? "Order details" : home ? "Order history" : "Settings";
  return <>
    <header className={s.header}>
      <Link href="/account/portal" scroll={false} className={s.identity}><span className={s.logo}>iP</span><div><p className={s.eyebrow}>InGamePIN · B2B portal</p><h1>{title}</h1><p className={s.muted}>{name}</p></div></Link>
      <div className={s.actions}><Link className={s.button} href={home ? "/account/dashboard" : "/account/portal"} scroll={false}>{home ? "⇄ Switch to Retail" : "← Back"}</Link>{logout}</div>
    </header>
    {home && children}
  </>;
}
