"use client";

import Image from "next/image";

type PaymentMethodsBannerProps = {
  className?: string;
  variant?: "checkout" | "footer";
};

export const paymentMethods = [
  {
    name: "USDT",
    description: "TRC20 · BEP20 · Solana",
    image: "/payment-methods/usdt.png",
    width: 48,
  },
  {
    name: "SBP",
    description: "Faster Payment System",
    image: "/payment-methods/sbp.jpg",
    width: 48,
  },
  {
    name: "Binance Pay",
    description: "Pay with Binance",
    image: "/payment-methods/binance-pay.png",
    width: 48,
  },
  {
    name: "UPI",
    description: "Scan and pay",
    image: "/payment-methods/upi.jpeg",
    width: 90,
  },
] as const;

export default function PaymentMethodsBanner({
  className = "",
  variant = "checkout",
}: PaymentMethodsBannerProps) {
  const isFooter = variant === "footer";

  return (
    <section
      aria-label="Accepted payment methods"
      className={`rounded-2xl border border-white/10 bg-slate-950/80 ${
        isFooter ? "px-3 py-3.5 sm:p-4" : "p-3"
      } ${className}`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-base text-cyan-300">
            {"\u2713"}
          </span>

          <div>
            <h2 className="text-base font-bold text-white sm:text-lg">
              Accepted payment methods
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              Choose your preferred way to pay
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {paymentMethods.map((method) => (
            <div
              key={method.name}
              className="flex min-h-[112px] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-2 py-2.5 text-center text-slate-200"
            >
              <Image
                src={method.image}
                alt=""
                aria-hidden="true"
                width={method.width}
                height={48}
                className="h-[48px] shrink-0 rounded-lg object-contain"
                style={{ width: method.width }}
              />
              <div className="min-w-0">
                <span className="block text-[15px] font-bold leading-snug">{method.name}</span>
                <span className="mt-0.5 block text-[11px] leading-normal text-slate-400">{method.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
