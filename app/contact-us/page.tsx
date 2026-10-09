import type { Metadata } from "next";
import Link from "next/link";
import BusinessDetails from "@/components/BusinessDetails";
import ContactForm from "@/components/ContactForm";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/StoreInformation.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact InGamePin support by email, WhatsApp, Telegram or our contact form for help with orders, payments and delivery.",
  alternates: { canonical: "https://www.ingamepin.com/contact-us" },
};

export default async function ContactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const name = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  return (
    <main className={`${styles.page} min-h-screen bg-slate-950 text-white`}>
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Customer support</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">Contact Us</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">We&apos;re here to help with your order, payment or delivery. Send a message below or reach us through your preferred support channel.</p>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
          <ContactForm initialName={name} accountEmail={user?.email ?? ""} />
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
              <h2 className="text-2xl font-black">Other ways to reach us</h2>
              <div className="mt-5 grid gap-3">
                <a href="https://wa.me/919073045011" target="_blank" rel="noopener noreferrer" className="support-channel rounded-xl border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-400"><span className="block font-bold">WhatsApp</span><span className="mt-1 block text-sm">+91 90730 45011</span></a>
                <a href="https://t.me/ingamepinsupport" target="_blank" rel="noopener noreferrer" className="support-channel rounded-xl border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-400"><span className="block font-bold">Telegram</span><span className="mt-1 block text-sm">@ingamepinsupport</span></a>
                <a href="mailto:support@ingamepin.com" className="support-channel rounded-xl border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-400"><span className="block font-bold">Email</span><span className="mt-1 block break-all text-sm">support@ingamepin.com</span></a>
              </div>
              <h3 className="mt-6 font-bold">Support hours</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Monday–Sunday, 10:00 AM–10:00 PM IST (UTC+5:30).</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Chat responses usually take 5–15 minutes during support hours. Messages sent outside these hours are handled when support reopens.</p>
              <p className="mt-2 text-sm text-slate-400">Languages: English, Hindi and Bengali.</p>
            </section>
            <BusinessDetails />
          </div>
        </div>
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
          <h2 className="text-2xl font-black">Frequently asked questions</h2>
          <div className="mt-6 space-y-6 text-sm leading-6 text-slate-300">
            <div><h3 className="font-bold text-cyan-400">How long does delivery take?</h3><p className="mt-2">Delivery is instant or manual depending on the product. Check your product page for its delivery method and estimated time after payment confirmation.</p></div>
            <div><h3 className="font-bold text-cyan-400">I haven&apos;t received my order.</h3><p className="mt-2"><Link href="/track-order" className="text-cyan-400 underline underline-offset-4">Check your order status</Link>, then contact us with your order number if you need help.</p></div>
            <div><h3 className="font-bold text-cyan-400">Can I cancel my order?</h3><p className="mt-2">Eligibility depends on the order status. Contact us before the order is processed and review our <Link href="/refund-policy" className="text-cyan-400 underline underline-offset-4">Refund &amp; Cancellation Policy</Link>.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}
