"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminSidebarProps = {
  orderCount?: number;
  walletCount?: number;
};

const links = [
  {
    label: "Overview",
    href: "/admin",
    icon: "▦",
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: "◇",
  },
  {
    label: "Categories",
    href: "/admin/categories",
    icon: "▧",
  },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: "▣",
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: "▤",
  },
  {
    label: "Preorder Popup",
    href: "/admin/preorder-popup",
    icon: "P",
  },
  {
    label: "Wallet",
    href: "/admin/wallet",
    icon: "$",
  },
  {
    label: "Gift codes",
    href: "/admin/gift-codes",
    icon: "⌘",
  },
  {
    label: "Customer Discounts",
    href: "/admin/customer-discounts",
    icon: "%",
  },
  {
    label: "Customers",
    href: "/admin/customers",
    icon: "@",
  },
];

export default function AdminSidebar({
  orderCount = 0,
  walletCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") {
      return pathname === "/admin";
    }

    return pathname.startsWith(href);
  }

  return (
    <aside className="border-b border-slate-200 bg-slate-50 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 font-black text-white">
          IP
        </div>

        <div>
          <p className="font-black text-slate-900">
            InGamePin
          </p>

          <p className="text-xs text-slate-500">
            Admin
          </p>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-3 pb-4 md:grid md:overflow-visible">
        {links.map((link) => {
          const active = isActive(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-w-fit items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-blue-100 text-blue-600"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span
                aria-hidden="true"
                className="w-5 text-center text-lg"
              >
                {link.icon}
              </span>

              <span>{link.label}</span>

              {link.label === "Orders" &&
                orderCount > 0 && (
                  <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600">
                    {orderCount}
                  </span>
                )}

              {link.label === "Wallet" &&
                walletCount > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {walletCount}
                  </span>
                )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden px-3 pb-5 md:block">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <span
            aria-hidden="true"
            className="w-5 text-center"
          >
            ←
          </span>

          Return to store
        </Link>
      </div>
    </aside>
  );
}
