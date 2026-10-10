"use client";

import Link from "@/components/NavigationLink";
import { usePathname } from "next/navigation";
import AccountIcon, { type AccountIconName } from "./AccountIcon";
import styles from "./Account.module.css";

const links = [
  { label: "Overview", href: "/account/dashboard", icon: "overview" },
  { label: "My orders", href: "/account/orders", icon: "orders" },
  { label: "Wallet", href: "/account/wallet", icon: "wallet" },
  { label: "Affiliate", href: "/account/affiliate", icon: "affiliate" },
  { label: "Notifications", href: "/account/notifications", icon: "notifications" },
  { label: "Security", href: "/account/security", icon: "security" },
  { label: "Profile", href: "/account/profile", icon: "profile" },
] satisfies { label: string; href: string; icon: AccountIconName }[];

export default function CustomerAccountNav({ activePage, orderCount, unreadCount }: {
  activePage?: "overview" | "orders";
  orderCount?: number;
  unreadCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Account navigation">
      {links.map((link) => {
        const active = activePage && pathname === "/account/dashboard"
          ? link.icon === activePage
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const count = link.icon === "orders" ? orderCount : link.icon === "notifications" && unreadCount ? unreadCount : undefined;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={styles.navLink}
            aria-current={active ? "page" : undefined}
          >
            <AccountIcon name={link.icon} />
            {link.label}
            {count !== undefined && <span className={styles.count}>{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
