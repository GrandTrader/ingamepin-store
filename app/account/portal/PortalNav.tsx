"use client";
import Link from "@/components/NavigationLink";
import { usePathname } from "next/navigation";
import s from "./Portal.module.css";
const links=[["/account/portal","Order history"],["/account/portal/new","New order"],["/account/portal/statement","Wallet statement"],["/account/portal/wallet","Add funds"],["/account/portal/settings","Settings"]];
export default function PortalNav(){const path=usePathname();return <nav className={s.nav} aria-label="Business portal">{links.map(([href,label])=>{
 const active=path===href||(href==="/account/portal"&&path.startsWith("/account/portal/orders/"))||(href.endsWith("/settings")&&["/account/portal/profile","/account/portal/security","/account/portal/business"].includes(path));
 return <Link key={href} href={href} scroll={false} aria-current={active?"page":undefined}>{label}</Link>;
})}</nav>;}
