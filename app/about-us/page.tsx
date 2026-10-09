import type { Metadata } from "next";
import Link from "next/link";
import BusinessDetails from "@/components/BusinessDetails";
import styles from "@/components/StoreInformation.module.css";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about InGamePin, a digital gaming store operated by AMAN G in Kolkata, India.",
  alternates: { canonical: "https://www.ingamepin.com/about-us" },
};

export default function AboutPage() {
  return (
    <main className={`${styles.page} min-h-screen bg-slate-950 text-white`}>
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">iNgamePIN · Digital game store</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">About Us</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">InGamePin is a digital gaming store operated by AMAN G in Kolkata, India. We help customers purchase gaming top-ups, gift cards, subscriptions and game keys.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 px-5 py-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
            <h2 className="text-2xl font-black">What we offer</h2>
            <p className="mt-4 leading-7 text-slate-300">Browse digital products for gaming platforms and services, including Steam, PlayStation and Xbox. Each listing shows the available options, supported region, price and delivery details.</p>
            <p className="mt-4 leading-7 text-slate-300">Please check the product&apos;s region and platform requirements before purchasing. Brand names and trademarks belong to their respective owners.</p>
            <Link href="/products" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-300">Browse products</Link>
          </section>
          <section className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
            <h2 className="text-2xl font-black">Delivery and support</h2>
            <p className="mt-4 leading-7 text-slate-300">Orders are delivered digitally after payment confirmation. Some products use instant delivery from available stock; others are fulfilled manually. The product page explains the delivery method and estimated time.</p>
            <p className="mt-4 leading-7 text-slate-300">For help with an order, payment or delivery, <Link href="/contact-us" className="text-cyan-400 underline underline-offset-4">contact our support team</Link>. Include your order number so we can find your purchase.</p>
            <nav aria-label="Store policies" className="mt-6 flex flex-wrap gap-4 text-sm text-cyan-400 underline underline-offset-4">
              <Link href="/terms">Terms &amp; Conditions</Link><Link href="/privacy-policy">Privacy Policy</Link><Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>
            </nav>
          </section>
        </div>
        <div><BusinessDetails /></div>
      </div>
    </main>
  );
}
