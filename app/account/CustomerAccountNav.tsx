"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [{ label: "Overview", href: "/account/dashboard" }, { label: "My Orders", href: "/account/orders" }, { label: "My Codes", href: "/account/codes" }, { label: "Wallet", href: "/account/wallet" }, { label: "Notifications", href: "/account/notifications" }, { label: "Profile", href: "/account/profile" }];
export default function CustomerAccountNav() { const pathname = usePathname(); return <nav className="mt-3 flex gap-2 overflow-x-auto md:grid md:overflow-visible">{links.map((link) => { const active = pathname === link.href || pathname.startsWith(`${link.href}/`); return <Link key={link.href} href={link.href} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold ${active ? "bg-cyan-50 text-cyan-700" : "text-slate-500 hover:bg-slate-50"}`}>{link.label}</Link>; })}</nav>; }
