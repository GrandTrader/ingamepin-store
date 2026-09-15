"use client";
/* Product and category artwork use the existing store image URLs. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BrowseProduct } from "./ProductBrowser";
import CountryFlag from "./CountryFlag";
import { countryCode } from "@/lib/country-flag";
import { useStorePreferences, type StoreCurrency, type StoreLanguage } from "./StorePreferences";
import styles from "./MobileStorefront.module.css";

type Category = { id: string; name: string; short_name: string | null; slug: string; image_url: string | null };
type Props = { products: BrowseProduct[]; popularIds: string[]; newestIds: string[]; categories: Category[] };
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
function MobileProduct({ product }: { product: BrowseProduct }) {
  const { language, formatPrice, t } = useStorePreferences();
  const [broken, setBroken] = useState(false);
  const image = language === "ru" && product.imageRu ? product.imageRu : product.image;
  const name = language === "ru" && product.nameRu ? product.nameRu : product.name;
  const unavailable = !product.isBulkOrder && product.stock <= 0;
  const instantDelivery = !!product.isInstantDelivery && !product.isBulkOrder;
  const discount = Math.min(100, Math.max(0, product.discountPercent ?? 0));
  return <Link className={styles.card} href={product.href ?? `/product/${product.slug}`}>
    <div className={styles.art} data-unavailable={unavailable}>
      {image && !broken ? <img src={image} alt={name} loading="lazy" onError={() => setBroken(true)} /> : <span aria-hidden="true">🎮</span>}
    </div>
    <span className={styles.delivery} data-instant={instantDelivery}>
      <span aria-hidden="true">{instantDelivery ? "⚡" : "▦"}</span>
      {instantDelivery ? (language === "ru" ? "Мгновенная доставка" : "Instant Delivery") : (language === "ru" ? "Цифровая доставка" : "Digital Delivery")}
    </span>
    <h3>{name}</h3>
    <div className={styles.badges}><span className={styles.region}><CountryFlag region={product.region} className="h-3 w-4" />{countryCode(product.region)?.toUpperCase() ?? "Global"}</span><span className={styles.stock} data-empty={unavailable}><i />{t(unavailable ? "outOfStock" : "inStock")}</span></div>
    <div className={styles.priceRow}><div><small>{language === "ru" ? "От" : "From"}</small><strong>{formatPrice(product.price * (1 - discount / 100))}</strong>{discount > 0 && <del>{formatPrice(product.price)}</del>}</div><span className={styles.productArrow} aria-label={unavailable ? "View unavailable product" : "Choose denomination"}><Icon name="arrow" /></span></div>
  </Link>;
}
export default function MobileStorefront({ products, popularIds, newestIds, categories }: Props) {
  const { currency, setCurrency, language, setLanguage, formatPrice } = useStorePreferences();
  const [tab, setTab] = useState("Popular");
  const [query, setQuery] = useState("");
  const [allCategories, setAllCategories] = useState(false);
  const [wallet, setWallet] = useState<number | null>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (accountMenu.current?.open && !accountMenu.current.contains(event.target as Node)) accountMenu.current.open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && accountMenu.current?.open) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/wallet/balance", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.authenticated && typeof data.balance === "number") setWallet(data.balance);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const map = new Map(products.map(p => [p.id, p]));
  const ranked = (tab === "New arrivals" ? newestIds : popularIds).map(id => map.get(id)).filter((p): p is BrowseProduct => !!p);
  const shown = query.trim() ? products.filter(p => `${p.name} ${p.nameRu ?? ""} ${p.category}`.toLowerCase().includes(query.trim().toLowerCase())) : tab === "Top-ups" ? products.filter(p => p.productType === "GAME_TOPUP") : ranked;
  const preferred = ["playstation", "apple", "steam", "xbox"];
  const quickCategories = [...categories].sort((a, b) => {
    const rank = (c: Category) => { const index = preferred.findIndex(key => `${c.slug} ${c.name}`.toLowerCase().includes(key)); return index < 0 ? 10 : index; };
    return rank(a) - rank(b);
  });
  return <div className={styles.root}>
    <header className={styles.header}>
      <div className={styles.top}><Link href="/" className={styles.brand}><span>iP</span>iNgamePIN</Link><div className={styles.topActions}><Link href="/account/notifications" aria-label="Notifications"><Icon name="bell" /></Link><details ref={accountMenu} className={styles.accountMenu}>
        <summary aria-label="Account menu"><Icon name="account" /></summary>
        <div className={styles.accountPanel}>
          <strong>My account</strong>
          <Link href="/account/dashboard"><Icon name="account" />Account dashboard<Icon name="arrow" /></Link>
          <Link href="/account/wallet"><Icon name="wallet" /><span>My wallet</span><b>{wallet === null ? "Sign in" : formatPrice(wallet)}</b></Link>
          <label htmlFor="mobile-account-currency">Currency<select id="mobile-account-currency" value={currency} onChange={event => setCurrency(event.target.value as StoreCurrency)}><option value="USD">USD — US Dollar</option><option value="INR">INR — Indian Rupee</option><option value="RUB">RUB — Russian Ruble</option></select></label>
          <label htmlFor="mobile-account-language">Language<select id="mobile-account-language" value={language} onChange={event => setLanguage(event.target.value as StoreLanguage)}>{[["en","English"],["ru","Русский"],["de","Deutsch"],["fr","Français"],["es","Español"],["ar","العربية"],["zh","中文"],["th","ไทย"]].map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        </div>
      </details></div></div>
      <label className={styles.search}><Icon name="browse" /><input aria-label="Search games and gift cards" placeholder="Search games & gift cards" value={query} onChange={event => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>

    </header>
    <div className={styles.content}>
      {!query && <>
        <section id="mobile-categories"><div className={styles.sectionHeading}><h2>Browse categories</h2><button onClick={() => setAllCategories(!allCategories)} aria-expanded={allCategories}>{allCategories ? "Show less" : "See all"} ›</button></div><div className={styles.categories}>{(allCategories ? quickCategories : quickCategories.slice(0,4)).map(c => <Link key={c.id} href={`/category/${c.slug}`}><span>{c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <Icon name="browse" />}</span><b>{/playstation/i.test(c.name) ? "PlayStation" : /apple/i.test(c.name) ? "Apple" : /steam/i.test(c.name) ? "Steam" : /xbox/i.test(c.name) ? "Xbox" : c.short_name ?? c.name}</b></Link>)}{!allCategories && <button onClick={() => setAllCategories(true)}><span><Icon name="more" /></span><b>More</b></button>}</div></section>
      </>}
      <section><div className={styles.tabs} role="tablist" aria-label="Product collections" onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowRight" ? (index + 1) % buttons.length : event.key === "ArrowLeft" ? (index + buttons.length - 1) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next].focus(); buttons[next].click(); }
      }}>{["Popular", "New arrivals", "Top-ups"].map(label => <button key={label} role="tab" tabIndex={tab === label ? 0 : -1} aria-selected={tab === label} aria-controls="mobile-products-panel" id={`mobile-tab-${label.replaceAll(" ", "-")}`} onClick={() => {setTab(label); setQuery("");}}>{label}</button>)}</div>
      {query && <p className={styles.resultCount}>{shown.length} results for “{query}”</p>}
      <div id="mobile-products-panel" role="tabpanel" aria-labelledby={`mobile-tab-${tab.replaceAll(" ", "-")}`} className={styles.products}>{shown.slice(0,24).map(product => <MobileProduct key={product.id} product={product} />)}</div>{shown.length === 0 && <p className={styles.empty}>No products found. Try another search or category.</p>}<Link className={styles.viewAll} href="/products">View all products <Icon name="arrow" /></Link></section>
      <footer className={styles.footer}><Link href="/support">Help & support</Link><Link href="/work-with-us">Partnerships</Link><Link href="/terms">Terms</Link><Link href="/privacy-policy">Privacy</Link><Link href="/products/bulk">B2B store</Link></footer>
    </div>

  </div>;
}
