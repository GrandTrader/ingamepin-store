import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Affiliate Program | InGamePin",
  description:
    "Join the InGamePin Affiliate Program, share eligible products and earn USDT commission from approved sales.",
};

type AffiliateSettings = {
  program_enabled: boolean;
  minimum_payout: number;
  holding_days: number;
  cookie_days: number;
  payout_fee: number;
  payout_networks: string[];
};

const defaultSettings: AffiliateSettings = {
  program_enabled: true,
  minimum_payout: 25,
  holding_days: 7,
  cookie_days: 30,
  payout_fee: 3,
  payout_networks: ["TRC20", "BEP20", "SOLANA"],
};

export default async function AffiliateProgramPage() {
  const settingsResult = await createAdminClient()
    .from("affiliate_settings")
    .select(
      "program_enabled, minimum_payout, holding_days, cookie_days, payout_fee, payout_networks",
    )
    .eq("id", 1)
    .maybeSingle();

  const settings: AffiliateSettings = settingsResult.data
    ? {
        program_enabled: Boolean(settingsResult.data.program_enabled),
        minimum_payout: Number(settingsResult.data.minimum_payout),
        holding_days: Number(settingsResult.data.holding_days),
        cookie_days: Number(settingsResult.data.cookie_days),
        payout_fee: Number(settingsResult.data.payout_fee),
        payout_networks: Array.isArray(settingsResult.data.payout_networks)
          ? settingsResult.data.payout_networks.map(String)
          : defaultSettings.payout_networks,
      }
    : defaultSettings;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="affiliate-program-hero border-b border-white/10 bg-gradient-to-br from-cyan-500/15 via-slate-950 to-blue-600/15">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-400">
            InGamePin Marketing Partners
          </p>
          <h1 className="affiliate-program-hero-title mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
            Promote digital products. Earn commission in USDT.
          </h1>
          <p className="affiliate-program-hero-copy mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            Join the InGamePin Affiliate Program, create referral links for
            eligible products and earn commission from completed, approved
            customer orders.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {settings.program_enabled ? (
              <Link
                href="/account/affiliate"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-7 py-3.5 font-black text-slate-950 transition hover:bg-cyan-300"
              >
                Join Affiliate Program
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl bg-slate-700 px-7 py-3.5 font-black text-slate-300">
                Applications are currently closed
              </span>
            )}
            <a
              href="#affiliate-terms"
              className="affiliate-program-terms-button inline-flex items-center justify-center rounded-xl border border-white/15 px-7 py-3.5 font-bold text-white transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Read Program Terms
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProgramStat label="Referral tracking" value={`${settings.cookie_days} days`} />
          <ProgramStat label="Commission holding" value={`${settings.holding_days} days`} />
          <ProgramStat label="Minimum payout" value={`${settings.minimum_payout} USDT`} />
          <ProgramStat label="Payout fee" value={`${settings.payout_fee} USDT`} />
        </div>

        <div className="mt-14">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-400">
            How it works
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <Step number="1" title="Apply" text="Sign in, submit your promotion details and wait for administrator approval." />
            <Step number="2" title="Create links" text="Choose an eligible product, set an allowed commission and copy your referral link." />
            <Step number="3" title="Promote" text="Share accurate product information through your approved marketing channels." />
            <Step number="4" title="Earn USDT" text="Approved commission becomes available after the holding period and can be withdrawn." />
          </div>
        </div>

        <article
          id="affiliate-terms"
          className="mt-16 scroll-mt-28 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-10"
        >
          <div className="border-b border-white/10 pb-8">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-400">
              Legal agreement
            </p>
            <h2 className="mt-3 text-3xl font-black">
              InGamePin Affiliate Program Terms &amp; Conditions
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Last updated: August 12, 2026
            </p>
          </div>

          <div className="mt-8 grid gap-9 text-sm leading-7 text-slate-300">
            <Term title="1. Agreement and operator">
              The InGamePin Affiliate Program is operated by AMAN G. By applying,
              participating, creating an affiliate link or requesting a payout,
              you agree to these Terms &amp; Conditions and all applicable laws.
            </Term>

            <Term title="2. Eligibility and approval">
              You must provide complete and accurate application information and
              use only one affiliate account unless written permission is given.
              Applications may be approved, rejected, suspended or reviewed at
              InGamePin&apos;s discretion. Approval does not create employment,
              agency, franchise or partnership.
            </Term>

            <Term title="3. Referral links and tracking">
              Commission is tracked only when a customer uses your valid affiliate
              link and completes an eligible order within the current {settings.cookie_days}-day
              tracking period. Browser settings, deleted cookies, another referral
              link or technical restrictions may affect attribution. InGamePin
              records are final for referral and commission calculations.
            </Term>

            <Term title="4. Product pricing and commission">
              You may select a commission rate only within the limit configured for
              each eligible product. The selected affiliate commission is added to
              the product price and the customer sees the final price before
              payment. Commission is calculated from the rate recorded when the
              order is created. Rates, eligible products and limits may change.
            </Term>

            <Term title="5. Valid commission">
              Commission is earned only on successfully paid, verified and
              fulfilled orders. No commission is payable for cancelled, refunded,
              charged-back, duplicated, fraudulent or otherwise invalid orders.
              Commission may be reversed or withheld when an order later becomes
              ineligible.
            </Term>

            <Term title="6. Self-referrals and prohibited activity">
              Purchasing through your own referral link does not earn commission.
              You must not use fake accounts, bots, cookie stuffing, forced
              redirects, misleading claims, unsolicited spam, stolen payment
              methods, trademark impersonation, artificial orders or any method
              intended to manipulate attribution, prices, clicks or commission.
            </Term>

            <Term title="7. Promotion standards">
              Promotions must be lawful, accurate and clearly identify your
              affiliate relationship. Do not claim to be InGamePin, guarantee
              unavailable prices or delivery times, copy official accounts, or use
              InGamePin branding in a domain or social username without written
              permission. You are responsible for content posted through your
              channels.
            </Term>

            <Term title="8. Holding period and available balance">
              Valid commission remains pending for {settings.holding_days} days
              after payment so the order can be checked for refunds, disputes and
              fraud. Pending commission cannot be withdrawn. Only commission shown
              as available may be included in a payout request.
            </Term>

            <Term title="9. USDT payouts">
              The minimum payout request is {settings.minimum_payout} USDT. A fixed {settings.payout_fee} USDT
              processing fee is deducted from each payout. Payouts are reviewed and
              sent manually through enabled USDT networks: {settings.payout_networks.join(", ")}.
              You are responsible for entering a compatible network and wallet
              address. Blockchain transactions are final and cannot be recovered
              if the information is incorrect.
            </Term>

            <Term title="10. Taxes and legal responsibility">
              You are responsible for reporting and paying taxes, duties and other
              obligations arising from affiliate income in your country. You must
              have the legal capacity and permissions required to participate.
            </Term>

            <Term title="11. Suspension and termination">
              InGamePin may suspend or terminate an affiliate account, cancel
              invalid commission, delay a payout for investigation or request
              additional verification where fraud, abuse, policy violations,
              chargebacks or legal risks are suspected. Confirmed valid available
              commission remains subject to these terms.
            </Term>

            <Term title="12. Program changes and contact">
              InGamePin may update the program, rates, products, payout rules or
              these terms. Continued participation after an update means you accept
              the revised terms. Questions may be sent to{" "}
              <a
                href="mailto:support@ingamepin.com"
                className="font-bold text-cyan-400 hover:text-cyan-300"
              >
                support@ingamepin.com
              </a>
              .
            </Term>
          </div>

          <div className="mt-10 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div>
              <p className="font-black text-white">Ready to become a partner?</p>
              <p className="mt-1 text-sm text-slate-300">
                Your application will be reviewed before referral tools are enabled.
              </p>
            </div>
            {settings.program_enabled && (
              <Link
                href="/account/affiliate"
                className="mt-4 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-300 sm:mt-0"
              >
                Join Affiliate Program
              </Link>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function ProgramStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-cyan-400">{value}</p>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400 font-black text-slate-950">
        {number}
      </span>
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function Term({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2">{children}</p>
    </section>
  );
}
