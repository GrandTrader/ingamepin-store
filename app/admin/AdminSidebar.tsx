"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type AdminSidebarProps = {
  orderCount?: number;
  walletCount?: number;
};

const links = [
  { label: "Overview", href: "/admin", icon: "OV" },
  { label: "Products", href: "/admin/products", icon: "PR" },
  { label: "Categories", href: "/admin/categories", icon: "CA" },
  { label: "Orders", href: "/admin/orders", icon: "OR" },
  { label: "Payments", href: "/admin/payments", icon: "PY" },
  { label: "Payment Settings", href: "/admin/payment-settings", icon: "PS" },
  { label: "Preorder Popup", href: "/admin/preorder-popup", icon: "PP" },
  { label: "Homepage Slider", href: "/admin/homepage-slider", icon: "HS" },
  { label: "Wallet", href: "/admin/wallet", icon: "WA" },
  { label: "Gift codes", href: "/admin/gift-codes", icon: "GC" },
  { label: "Customer Discounts", href: "/admin/customer-discounts", icon: "CD" },
  { label: "Customers", href: "/admin/customers", icon: "CU" },
  { label: "Live Chat", href: "/admin/live-chat", icon: "CH" },
];

export default function AdminSidebar({
  orderCount = 0,
  walletCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(href);
  }

  return (
    <aside className="shrink-0 border-b border-slate-200 bg-slate-50 lg:min-h-screen lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 font-black text-white">
            IP
          </div>
          <div>
            <p className="font-black text-slate-900">InGamePin</p>
            <p className="text-xs text-slate-500">Admin</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 lg:hidden"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      <nav
        className={`gap-2 px-3 pb-4 ${
          mobileOpen ? "grid" : "hidden"
        } lg:grid`}
      >
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                  active ? "bg-blue-600 text-white" : "bg-white text-slate-500"
                }`}
              >
                {link.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
              {link.label === "Orders" && orderCount > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                  {orderCount}
                </span>
              )}
              {link.label === "Wallet" && walletCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {walletCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={`${mobileOpen ? "block" : "hidden"} px-3 pb-5 lg:block`}>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-black">
            &lt;
          </span>
          Return to store
        </Link>
      </div>
    </aside>
  );
}
