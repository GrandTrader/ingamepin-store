"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStorePreferences } from "./StorePreferences";
import PaymentMethodsBanner from "./PaymentMethodsBanner";
import ThemeModeSwitch from "./ThemeModeSwitch";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

export default function Footer() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();
  const { t } = useStorePreferences();
  const [categories, setCategories] = useState<FooterCategory[]>([]);
  const footerCategories = categories.slice(0, 5);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase
      .from("categories")
      .select("id, name, slug, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (active) setCategories(data ?? []);
      });

    return () => {
      active = false;
    };
  }, []);

  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return (
      <footer className="mt-auto border-t border-white/10 bg-slate-950 text-white">
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 py-5 sm:px-5 md:flex-row">
            <div className="text-center md:text-left">
              <p className="text-sm font-bold text-white">{t("secureCheckout")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("confirmBeforePayment")}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {["InGamePin Wallet", "Binance Pay", "USDT TRC20", "USDT BEP20", "USDT Solana", "Pally - SBP"].map((method) => (
                <span key={method} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300">
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-black/20">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-center text-xs text-slate-500 sm:flex-row sm:px-5 sm:text-left">
            <p>{"\u00A9"} {currentYear} InGamePin, {t("operatedBy")} {t("rightsReserved")}</p>
            <div className="flex flex-col items-center gap-3 sm:items-end">
              <ThemeModeSwitch />
              <p>{t("trademarkNotice")}</p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-3 pt-5 sm:px-5 sm:pt-8">
        <PaymentMethodsBanner variant="footer" />
      </div>

      <div className="px-3 py-6 sm:hidden">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">
            iP
          </div>

          <div>
            <p className="text-lg font-black">
              iNgame<span className="text-cyan-400">PIN</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              {t("storeTagline")}
            </p>
          </div>
        </Link>

        <p className="mt-4 text-xs leading-5 text-slate-400">
          {t("footerSummary")}
        </p>

        <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
          <MobileFooterSection title={t("productCategories")}>
            {footerCategories.map((category) => (
              <Link key={category.id} href={`/category/${category.slug}`}>
                {category.name}
              </Link>
            ))}
            <Link href="/products">{t("viewAllProducts")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("customerHelp")}>
            <Link href="/track-order">{t("trackYourOrder")}</Link>
            <Link href="/support">{t("contactSupport")}</Link>
            <Link href="/work-with-us">Work With Us</Link>
            <Link href="/cart">{t("shoppingCart")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("legal")}>
            <Link href="/terms">{t("terms")}</Link>
            <Link href="/refund-policy">{t("refundPolicy")}</Link>
            <Link href="/privacy-policy">{t("privacyPolicy")}</Link>
            <Link href="/affiliate-program">{t("affiliateProgram")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("paymentDelivery")}>
            <span>Binance Pay</span>
            <span>Direct USDT: TRC20, BEP20 &amp; Solana</span>
            <span>Pally - SBP</span>
            <Link href="/track-order">{t("checkOrderStatus")}</Link>
          </MobileFooterSection>
        </div>

        <div className="mt-5 flex justify-center">
          <ThemeModeSwitch />
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500">
          {"\u00A9"} {currentYear} InGamePin, {t("operatedBy")} {t("rightsReserved")}
        </p>
      </div>

      <div className="mx-auto hidden max-w-7xl gap-10 px-5 py-14 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-lg font-black text-slate-950">
              iP
            </div>

            <div>
              <p className="text-xl font-black">
                iNgame
                <span className="text-cyan-400">
                  PIN
                </span>
              </p>

              <p className="text-xs uppercase tracking-widest text-slate-500">
                {t("storeTagline")}
              </p>
            </div>
          </Link>

          <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
            {t("footerSummary")}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              {t("securePayment")}
            </span>

            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              {t("digitalDelivery")}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-black">
            {t("productCategories")}
          </h2>

          <nav className="mt-5 grid gap-3 text-sm text-slate-400">
            {footerCategories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="transition hover:text-cyan-400"
              >
                {category.name}
              </Link>
            ))}

            <Link
              href="/products"
              className="font-bold text-cyan-400 transition hover:text-cyan-300"
            >
              {t("viewAllProducts")}
            </Link>
          </nav>
        </div>

        <div>
          <h2 className="text-lg font-black">
            {t("customerHelp")}
          </h2>

          <nav className="mt-5 grid gap-3 text-sm text-slate-400">
            <Link
              href="/track-order"
              className="transition hover:text-cyan-400"
            >
              {t("trackYourOrder")}
            </Link>

            <Link
              href="/support"
              className="transition hover:text-cyan-400"
            >
              {t("contactSupport")}
            </Link>

            <Link href="/work-with-us" className="transition hover:text-cyan-400">
              Work With Us
            </Link>

            <Link
              href="/cart"
              className="transition hover:text-cyan-400"
            >
              {t("shoppingCart")}
            </Link>

            <a
              href="mailto:support@ingamepin.com"
              className="transition hover:text-cyan-400"
            >
              support@ingamepin.com
            </a>
          </nav>
        </div>

        <div>
          <h2 className="text-lg font-black">
            {t("orderDeliveryLegal")}
          </h2>

          <Link
            href="/track-order"
            className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            {t("checkOrderStatus")}
          </Link>

          <nav className="mt-5 grid gap-3 text-sm text-slate-400">
            <Link href="/terms" className="transition hover:text-cyan-400">{t("terms")}</Link>
            <Link href="/refund-policy" className="transition hover:text-cyan-400">{t("refundPolicy")}</Link>
            <Link href="/privacy-policy" className="transition hover:text-cyan-400">{t("privacyPolicy")}</Link>
            <Link href="/affiliate-program" className="transition hover:text-cyan-400">{t("affiliateProgram")}</Link>
          </nav>
        </div>
      </div>

      <div className="hidden border-t border-white/10 sm:block">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-6 md:flex-row">
          <div>
            <p className="text-sm font-bold text-white">
              {t("secureCheckout")}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {t("confirmBeforePayment")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {["InGamePin Wallet", "Binance Pay", "USDT TRC20", "USDT BEP20", "USDT Solana", "Pally - SBP"].map((method) => (
              <span
                key={method}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden border-t border-white/10 bg-black/20 sm:block">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-center text-xs text-slate-500 sm:flex-row sm:text-left">
          <p>
            {"\u00A9"} {currentYear} InGamePin, {t("operatedBy")} {t("rightsReserved")}
          </p>

          <div className="flex flex-col items-center gap-3 sm:items-end">
            <ThemeModeSwitch />
            <p>
              {t("trademarkNotice")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function MobileFooterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-black">
        {title}
        <span className="text-lg text-cyan-400 transition group-open:rotate-45">+</span>
      </summary>

      <nav className="grid gap-3 pb-4 text-xs text-slate-400 [&_a]:transition [&_a]:hover:text-cyan-400">
        {children}
      </nav>
    </details>
  );
}
