"use client";
import { usePathname } from "next/navigation";
import { isBusinessPortalPath } from "@/lib/portal-navigation";
import type { ReactNode } from "react";
import Link from "@/components/NavigationLink";
import { customerLogout } from "./actions";
import AccountIcon from "./AccountIcon";
import CustomerAccountNav from "./CustomerAccountNav";
import styles from "./Account.module.css";

export default function CustomerAccountShell({
  displayName,
  children,
  activePage,
  orderCount,
  unreadCount,
}: {
  displayName: string;
  children: ReactNode;
  activePage?: "overview" | "orders";
  orderCount?: number;
  unreadCount?: number;
}) {
  const business = isBusinessPortalPath(usePathname());
  if (business) return <section className="min-w-0">{children}</section>;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className={styles.shell}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            <div className={styles.avatar}>
              {initials}
            </div>
            <div className={styles.identityText}>
              <strong>{displayName}</strong>
              <p>Customer account</p>
            </div>
          </div>

          <CustomerAccountNav activePage={activePage} orderCount={orderCount} unreadCount={unreadCount} />
          <div className={styles.sidebarBottom}>
            <Link href="/" className={styles.navLink}><AccountIcon name="back" />Back to store</Link>
            <form action={customerLogout}><button type="submit" className={styles.navLink}><AccountIcon name="signout" />Sign out</button></form>
          </div>
        </aside>

        <section className={styles.content}>
          {children}
        </section>
      </div>
    </div>
  );
}
