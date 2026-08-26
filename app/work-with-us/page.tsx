import type { Metadata } from "next";

import { submitPartnerApplication } from "./actions";

export const metadata: Metadata = {
  title: "Work With Us | InGamePin Partnerships",
  description: "Partner with InGamePin as a global payment provider or gaming product distributor.",
};

export default async function WorkWithUsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="overflow-hidden bg-slate-950 px-5 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">InGamePin Partnerships</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-black sm:text-6xl">Let&apos;s grow the future of digital gaming commerce</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300">We welcome established payment companies and gaming distributors that can help customers access secure local payments and genuine digital products worldwide.</p>
          <a href="#partner-application" className="mt-8 inline-flex rounded-xl bg-cyan-400 px-7 py-3.5 font-black text-slate-950 hover:bg-cyan-300">Submit a proposal</a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-100 text-3xl">💳</div>
            <h2 className="mt-6 text-2xl font-black">Become a payment partner</h2>
            <p className="mt-3 leading-7 text-slate-600">We are interested in payment gateways, wallets, acquiring partners, bank-transfer networks, local payment methods and compliant digital-asset payment providers.</p>
            <ul className="mt-5 grid gap-2 text-sm font-bold text-slate-700"><li>✓ Local and international payment coverage</li><li>✓ Secure API and webhook integration</li><li>✓ Transparent settlement and support</li></ul>
          </article>
          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-3xl">🎮</div>
            <h2 className="mt-6 text-2xl font-black">Become a gaming distributor</h2>
            <p className="mt-3 leading-7 text-slate-600">We welcome publishers, authorized distributors and wholesalers offering gift cards, game keys, subscriptions, wallet recharges and gaming top-ups.</p>
            <ul className="mt-5 grid gap-2 text-sm font-bold text-slate-700"><li>✓ Genuine regional and global inventory</li><li>✓ Bulk, API or automated fulfilment</li><li>✓ Competitive wholesale pricing</li></ul>
          </article>
        </div>

        <div className="mt-14 text-center"><p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-700">How it works</p><h2 className="mt-3 text-3xl font-black">Three simple steps</h2></div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[['01', 'Send your proposal', 'Tell us about your company, coverage, products and commercial model.'], ['02', 'Business review', 'Our team reviews fit, compliance, integration and commercial requirements.'], ['03', 'Start working together', 'We agree the terms, complete testing and launch the partnership.']].map(([number, title, text]) => <article key={number} className="rounded-2xl border border-slate-200 bg-white p-6"><span className="text-3xl font-black text-cyan-600">{number}</span><h3 className="mt-4 text-xl font-black">{title}</h3><p className="mt-2 leading-6 text-slate-600">{text}</p></article>)}
        </div>

        <section id="partner-application" className="mx-auto mt-14 max-w-4xl scroll-mt-28 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-400">Partnership application</p>
          <h2 className="mt-3 text-3xl font-black">Tell us about your business</h2>
          <p className="mt-3 text-slate-300">Business proposals only. Our team will reply to suitable applications by email.</p>
          {params.success && <p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 font-bold text-emerald-200">Thank you. Your partnership proposal has been sent.</p>}
          {params.error && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 font-bold text-red-200">{params.error}</p>}
          <form action={submitPartnerApplication} className="mt-7 grid gap-5 sm:grid-cols-2">
            <input name="company_site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <label className="font-bold">Partnership type<select name="partner_type" required className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3"><option value="">Select an option</option><option value="PAYMENT_PROVIDER">Payment provider</option><option value="GAMING_DISTRIBUTOR">Gaming distributor</option></select></label>
            <label className="font-bold">Company name<input name="company" required minLength={2} maxLength={120} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold">Contact person<input name="contact_name" required minLength={2} maxLength={100} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold">Business email<input name="email" type="email" required maxLength={160} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold">Company website<input name="website" type="url" placeholder="https://" maxLength={250} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold">Country / region<input name="country" required minLength={2} maxLength={100} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold sm:col-span-2">Estimated monthly volume <span className="font-normal text-slate-400">(optional)</span><input name="monthly_volume" maxLength={100} placeholder="Transactions, orders or inventory value" className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="font-bold sm:col-span-2">Proposal<textarea name="proposal" required minLength={20} maxLength={3000} rows={6} placeholder="Describe your services, markets, products, integration options and commercial proposal." className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3" /></label>
            <label className="flex items-start gap-3 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" required className="mt-1 h-4 w-4 accent-cyan-400" />I am authorized to contact InGamePin for this company and agree that the submitted information may be used to review this proposal.</label>
            <button className="rounded-xl bg-cyan-400 px-7 py-3.5 font-black text-slate-950 hover:bg-cyan-300 sm:col-span-2">Send partnership proposal</button>
          </form>
        </section>
      </section>
    </main>
  );
}
