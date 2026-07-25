"use client";

import Image from "next/image";

type PaymentMethodsBannerProps = {
  className?: string;
  variant?: "checkout" | "footer";
};

const paymentMethods = [
  {
    name: "InGamePin Wallet",
    shortName: "Wallet",
    image: "/icon.svg",
  },
  {
    name: "Binance Pay",
    shortName: "Binance Pay",
    image: "/payment-methods/binance-pay.svg",
  },
  {
    name: "USDT TRC20",
    shortName: "USDT TRC20",
    image: "/payment-methods/usdt-trc20.svg",
  },
  {
    name: "USDT BEP20",
    shortName: "USDT BEP20",
    image: "/payment-methods/usdt-bep20.svg",
  },
  {
    name: "Pally - SBP",
    shortName: "Pally - SBP",
    image: "/payment-methods/pally-sbp.svg",
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
        isFooter ? "p-4 sm:p-5" : "p-3.5 sm:p-4"
      } ${className}`}
    >
      <div
        className={
          isFooter
            ? "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
            : "space-y-3"
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-base text-cyan-300">
            ✓
          </span>

          <div>
            <h2 className="text-sm font-black text-white sm:text-base">
              Accepted payment methods
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              Secure payments <span aria-hidden="true">•</span> Automatic verification
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {paymentMethods.map((method) => (
            <div
              key={method.name}
              title={method.name}
              className="flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-slate-200 shadow-sm sm:text-xs"
            >
              <Image
                src={method.image}
                alt=""
                aria-hidden="true"
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-md object-contain"
              />
              <span>{isFooter ? method.name : method.shortName}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
