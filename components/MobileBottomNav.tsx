"use client";

import Link from "@/components/NavigationLink";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useStorePreferences } from "./StorePreferences";
import { translateCustomerText } from "./customer-ui-translations";
import styles from "./MobileBottomNav.module.css";

type IconName = "home" | "browse" | "cart" | "orders" | "account" | "bell" | "wallet" | "arrow" | "more";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    browse: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    cart: "M2 3h3l3 12h11l3-9H6M10 20h.01M18 20h.01",
    orders: "M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2ZM9 8h6M9 12h6M9 16h4",
    account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4",
    wallet: "M3 6h17v15H3V6Zm0 0V4l14-2v4M16 12h5v5h-5Z",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
  };
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

const subscribeToHydration = () => () => {};

export default function MobileBottomNav() {
  const { language, t } = useStorePreferences();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const localize = (text: string) => translateCustomerText(text, hydrated ? language : "en") ?? text;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    function updateCart() {
      try {
        const cart: unknown = JSON.parse(localStorage.getItem("shoppingCart") ?? "[]");
        setCartCount(Array.isArray(cart) ? cart.reduce((total, item) => total + (Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 0), 0) : 0);
      } catch { setCartCount(0); }
    }
    updateCart();
    window.addEventListener("cartUpdated", updateCart); window.addEventListener("storage", updateCart);
    return () => { window.removeEventListener("cartUpdated", updateCart); window.removeEventListener("storage", updateCart); };
  }, []);
  if (/^\/(admin|seller|vendor)(\/|$)/.test(pathname)) return null;
  const active = pathname === "/" ? "Home"
    : /^\/(products?|category)(\/|$)/.test(pathname) ? "Browse"
    : /^\/(cart|checkout)(\/|$)/.test(pathname) ? "Cart"
    : (/^\/(account\/orders|track-order)(\/|$)/.test(pathname) || (pathname === "/account/dashboard" && searchParams.get("view") === "orders")) ? "Orders"
    : /^\/(account|login|signup|register|auth)(\/|$)/.test(pathname) ? "Account" : null;
  return <>
    <div className={styles.spacer} aria-hidden="true" />
    <nav data-no-auto-translate className={styles.navigation} aria-label={localize("Mobile navigation")}>
      {([
        ["/", "home", "Home"], ["/products", "browse", "Browse"],
        ["/cart", "cart", "Cart"], ["/account/dashboard?view=orders#orders", "orders", "Orders"],
        ["/account/dashboard", "account", "Account"]
      ] as const).map(([href, icon, label]) => <Link key={label} href={href} aria-current={active === label ? "page" : undefined}>
        <span><Icon name={icon} />{label === "Cart" && cartCount > 0 && <b aria-label={localize(`${cartCount} items in cart`)}>{cartCount > 99 ? "99+" : cartCount}</b>}</span>{label === "Cart" ? (hydrated ? t("cart") : "Cart") : localize(label)}
      </Link>)}
    </nav>
  </>;
}
