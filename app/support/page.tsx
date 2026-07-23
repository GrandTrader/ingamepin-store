import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <section className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-7xl px-5 py-16 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-400">
            Customer Support
          </p>

          <h1 className="mt-3 text-5xl font-black">
            We're Here to Help
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            Need help with your order, payment or delivery?
            Contact our support team anytime.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Telegram */}
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-8">
            <div className="text-5xl">📨</div>

            <h2 className="mt-5 text-2xl font-black">
              Telegram
            </h2>

            <p className="mt-3 text-slate-400">
              Fastest response for orders and support.
            </p>

            <p className="mt-6 text-lg font-bold text-cyan-400">
              @inditopup
            </p>

            <a
              href="https://t.me/inditopup"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              Open Telegram
            </a>
          </div>

          {/* WhatsApp */}
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-8">
            <div className="text-5xl">💬</div>

            <h2 className="mt-5 text-2xl font-black">
              WhatsApp
            </h2>

            <p className="mt-3 text-slate-400">
              Contact us directly for order assistance.
            </p>

            <p className="mt-6 text-lg font-bold text-green-400">
              +91 90730 45011
            </p>

            <a
              href="https://wa.me/919073045011"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-xl bg-green-500 px-6 py-3 font-bold text-white transition hover:bg-green-600"
            >
              Chat on WhatsApp
            </a>
          </div>

          {/* Working Hours */}
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-8">
            <div className="text-5xl">🕒</div>

            <h2 className="mt-5 text-2xl font-black">
              Support Hours
            </h2>

            <div className="mt-6 space-y-3 text-slate-300">
              <div className="flex justify-between">
                <span>Monday - Sunday</span>
                <span>10:00 AM - 10:00 PM</span>
              </div>

              <div className="flex justify-between">
                <span>Response Time</span>
                <span>Usually 5–15 mins</span>
              </div>

              <div className="flex justify-between">
                <span>Language</span>
                <span>English, Hindi, Bengali</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 rounded-3xl border border-white/10 bg-slate-900 p-8">
          <h2 className="text-3xl font-black">
            Frequently Asked Questions
          </h2>

          <div className="mt-8 space-y-6">

            <div>
              <h3 className="font-bold text-cyan-400">
                How long does delivery take?
              </h3>

              <p className="mt-2 text-slate-400">
                Digital products are delivered manually after successful payment verification.
                Home delivery products follow the estimated delivery
                time shown on the product page.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-cyan-400">
                I haven't received my order.
              </h3>

              <p className="mt-2 text-slate-400">
                Contact us through Telegram or WhatsApp with your
                order number for immediate assistance.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-cyan-400">
                Can I cancel my order?
              </h3>

              <p className="mt-2 text-slate-400">
                Cancellation depends on the order status.
                Please contact support before the order is processed.
              </p>
            </div>

          </div>
        </div>

        {/* Back Home */}
        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300"
          >
            ← Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
