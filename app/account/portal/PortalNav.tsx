"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./Portal.module.css";
export default function PortalNav() { const path=usePathname(); return <nav className={s.nav} aria-label="Business portal">{[["/account/portal","Order history"],["/account/portal/new","New order"],["/account/portal/statement","Statement"],["/account/business","Verification & bank deposits"],["/account/profile","Account settings"]].map(([href,label])=><Link key={href} href={href} aria-current={path===href?"page":undefined}>{label}</Link>)}</nav>; }
