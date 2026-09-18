"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";

type AdminSidebarProps = {
  orderCount?: number;
  walletCount?: number;
};

const orderStatuses = [
  { key: "pending", label: "Pending" },
  { key: "review", label: "Payment review" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "trash", label: "Trash" },
] as const;
type OrderStatusCounts = Record<(typeof orderStatuses)[number]["key"], number>;

const links = [
  { label: "Overview", href: "/admin", icon: "OV" },
  { label: "Products", href: "/admin/products", icon: "PR" },
  { label: "Sellers", href: "/admin/sellers", icon: "SE" },
  { label: "Categories", href: "/admin/categories", icon: "CA" },
  { label: "Orders", href: "/admin/orders", icon: "OR" },
  { label: "Sales Report", href: "/admin/sales-report", icon: "SR" },
  { label: "Invoices", href: "/admin/invoices", icon: "IN" },
  { label: "Payment Settings", href: "/admin/payment-settings", icon: "PS" },
  { label: "Homepage Slider", href: "/admin/homepage-slider", icon: "HS" },
  { label: "Wallet", href: "/admin/wallet", icon: "WA" },
  { label: "Customer Discounts", href: "/admin/customer-discounts", icon: "CD" },
  { label: "Affiliates", href: "/admin/affiliates", icon: "AF" },
  { label: "Affiliate Applications", href: "/admin/affiliates/promoters", icon: "AA" },
  { label: "Customers", href: "/admin/customers", icon: "CU" },
  { label: "Reviews", href: "/admin/reviews", icon: "RV" },
  { label: "Live Chat", href: "/admin/live-chat", icon: "CH" },
  { label: "Bulk API", href: "/admin/bulk-api", icon: "API" },
  { label: "Security", href: "/admin/security", icon: "SC" },
];


const menuGroups = [
  {
    "label": "Catalog",
    "icon": "PR",
    "paths": [
      "/admin/products",
      "/admin/categories"
    ]
  },
  {
    "label": "Orders & sales",
    "icon": "OR",
    "paths": [
      "/admin/orders",
      "/admin/sales-report",
      "/admin/invoices"
    ]
  },
  {
    "label": "Sellers",
    "icon": "SE",
    "paths": [
      "/admin/sellers",


    ]
  },
  {
    "label": "Customers & support",
    "icon": "CU",
    "paths": [
      "/admin/customers",


      "/admin/live-chat",
      "/admin/reviews"
    ]
  },
  {
    "label": "Payments & wallet",
    "icon": "WA",
    "paths": [
      "/admin/payment-settings",
      "/admin/wallet"
    ]
  },
  {
    "label": "Marketing",
    "icon": "MK",
    "paths": [
      "/admin/homepage-slider",
      "/admin/customer-discounts",
      "/admin/affiliates",
      "/admin/affiliates/promoters"
    ]
  },
  {
    "label": "Settings & API",
    "icon": "SC",
    "paths": [
      "/admin/bulk-api",
      "/admin/security"
    ]
  }
];

export default function AdminSidebar(props: AdminSidebarProps) {
  return <Suspense><AdminSidebarContent {...props} /></Suspense>;
}

function AdminSidebarContent({
  orderCount = 0,
  walletCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedStatus = searchParams.get("status");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveOrderCount, setLiveOrderCount] = useState(orderCount);
  const [orderStatusCounts, setOrderStatusCounts] = useState<OrderStatusCounts | null>(null);
  const [pendingAffiliateCount, setPendingAffiliateCount] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;

    async function loadOrderCount() {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);

      try {
        const response = await fetch("/api/admin/order-notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const result = (await response.json()) as {
          count?: number;
          orderStatusCounts?: OrderStatusCounts;
          affiliateApplicationCount?: number;
        };
        if (active && result.orderStatusCounts) setOrderStatusCounts(result.orderStatusCounts);
        if (active && typeof result.count === "number") {
          setLiveOrderCount(result.count);
        }
        if (
          active &&
          typeof result.affiliateApplicationCount === "number"
        ) {
          setPendingAffiliateCount(result.affiliateApplicationCount);
        }
      } catch {
        // Keep the last known count when the network is temporarily unavailable.
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    }

    void loadOrderCount();
    const timer = window.setInterval(() => void loadOrderCount(), 15000);
    document.addEventListener("visibilitychange", loadOrderCount);

    return () => {
      active = false;
      controller?.abort();
      document.removeEventListener("visibilitychange", loadOrderCount);
      window.clearInterval(timer);
    };
  }, []);

  function isActive(href: string) {
    return href === "/admin"
      ? pathname === "/admin"
      : (pathname === href || pathname.startsWith(href + "/")) &&
        !links.some((link) => link.href !== href && link.href.startsWith(href + "/") &&
          (pathname === link.href || pathname.startsWith(link.href + "/")));
  }

  function renderLink(link: (typeof links)[number]) {
          const active = isActive(link.href) && !(link.href === "/admin/orders" && pathname === "/admin/orders" && orderStatuses.some((status) => status.key === selectedStatus));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
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
              {link.label === "Orders" && liveOrderCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white shadow-sm"
                  aria-label={`${liveOrderCount} processing orders`}
                >
                  <span aria-hidden="true">●</span>
                  {liveOrderCount}
                </span>
              )}
              {link.label === "Affiliate Applications" && pendingAffiliateCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white shadow-sm"
                  aria-label={`${pendingAffiliateCount} pending affiliate applications`}
                >
                  <span aria-hidden="true">●</span>
                  {pendingAffiliateCount}
                </span>
              )}
              {link.label === "Wallet" && walletCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {walletCount}
                </span>
              )}
            </Link>
          );
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
        aria-label="Admin navigation"
        className={`gap-2 px-3 pb-4 ${
          mobileOpen ? "grid" : "hidden"
        } lg:grid`}
      >
        {renderLink(links[0])}
        {menuGroups.map((group) => {
          const children = links.filter((link) => group.paths.includes(link.href));
          const active = children.some((link) => isActive(link.href));
          const pending = children.reduce((total, link) => total + (
            link.href === "/admin/orders" ? liveOrderCount :
            link.href === "/admin/affiliates/promoters" ? pendingAffiliateCount :
            link.href === "/admin/wallet" ? walletCount : 0
          ), 0);
          return (
            <details key={group.label + pathname} open={active} className="group rounded-xl">
              <summary className={
                "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden " +
                (active ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-slate-100")
              }>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black">{group.icon}</span>
                <span className="min-w-0 flex-1">{group.label}</span>
                {pending > 0 && <span aria-label={pending + " pending items"} className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">{pending}</span>}
                <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                {children.map((link) => (
                  <Fragment key={link.href}>
                    {renderLink(link)}
                    {link.href === "/admin/orders" && orderStatuses.map((status) => {
                      const active = pathname === "/admin/orders" && selectedStatus === status.key;
                      const count = orderStatusCounts?.[status.key];
                      return (
                        <Link
                          key={status.key}
                          href={"/admin/orders?status=" + status.key}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileOpen(false)}
                          className={"flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition " +
                            (active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}
                        >
                          <span>{status.label}</span>
                          <span
                            className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums " +
                              (status.key === "processing" || status.key === "review"
                                ? "bg-red-500 font-black text-white shadow-sm"
                                : "bg-white font-bold")}
                            aria-label={count === undefined ? `${status.label} count loading` : `${count} ${status.label.toLowerCase()} orders`}
                          >
                            {(status.key === "processing" || status.key === "review") && (count ?? 0) > 0 && <span aria-hidden="true">●</span>}
                            {count === undefined ? "…" : count}
                          </span>
                        </Link>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </details>
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
