"use client";

import Link from "next/link";
import { useStorePreferences } from "./StorePreferences";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useStorePreferences();

  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950 text-white">
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
            <Link href="/#game_topup">{t("gamingTopups")}</Link>
            <Link href="/#gift_card">{t("giftCards")}</Link>
            <Link href="/#subscription">{t("subscriptions")}</Link>
            <Link href="/#game_key">{t("gameKeys")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("customerHelp")}>
            <Link href="/track-order">{t("trackYourOrder")}</Link>
            <Link href="/support">{t("contactSupport")}</Link>
            <Link href="/cart">{t("shoppingCart")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("legal")}>
            <Link href="/terms">{t("terms")}</Link>
            <Link href="/refund-policy">{t("refundPolicy")}</Link>
            <Link href="/privacy-policy">{t("privacyPolicy")}</Link>
          </MobileFooterSection>

          <MobileFooterSection title={t("paymentDelivery")}>
            <span>Binance Pay</span>
            <Link href="/track-order">{t("checkOrderStatus")}</Link>
          </MobileFooterSection>
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500">
          {"\u00A9"} {currentYear} InGamePin, operated by AMAN G. {t("rightsReserved")}
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
            <Link
              href="/#game_topup"
              className="transition hover:text-cyan-400"
            >
              {t("gamingTopups")}
            </Link>

            <Link
              href="/#gift_card"
              className="transition hover:text-cyan-400"
            >
              {t("giftCards")}
            </Link>

            <Link
              href="/#subscription"
              className="transition hover:text-cyan-400"
            >
              {t("subscriptions")}
            </Link>

            <Link
              href="/#game_key"
              className="transition hover:text-cyan-400"
            >
              {t("gameKeys")}
            </Link>

            <Link
              href="/#all-products"
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
            {[
              "Binance Pay",
            ].map((method) => (
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
            {"\u00A9"} {currentYear} InGamePin, operated by AMAN G. {t("rightsReserved")}
          </p>

          <p>
            {t("trademarkNotice")}
          </p>
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
