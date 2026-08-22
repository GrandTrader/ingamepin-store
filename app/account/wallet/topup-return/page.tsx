"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function WalletTopupReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId") ?? "";
  const [message, setMessage] = useState("Confirming your wallet payment...");

  useEffect(() => {
    if (!requestId) {
      router.replace("/account/wallet?error=Wallet+payment+reference+is+missing");
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function checkStatus() {
      try {
        const response = await fetch(
          `/api/wallet/topup/status?requestId=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as {
          topupStatus?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to verify payment.");
        }
        if (result.topupStatus === "APPROVED") {
          router.replace("/account/wallet?success=Wallet+top-up+completed");
          return;
        }
        if (["REJECTED", "EXPIRED"].includes(result.topupStatus ?? "")) {
          router.replace("/account/wallet?error=Wallet+payment+was+not+completed");
          return;
        }

        setMessage("Payment received. Waiting for gateway confirmation...");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to verify payment.",
        );
      }

      if (!stopped) timer = setTimeout(checkStatus, 2000);
    }

    void checkStatus();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, router]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-500" />
        <h1 className="mt-6 text-3xl font-black text-slate-950">
          Wallet payment received
        </h1>
        <p className="mt-3 text-slate-600">{message}</p>
        <p className="mt-2 text-sm text-slate-500">
          This page updates and redirects automatically.
        </p>
      </section>
    </main>
  );
}

export default function WalletTopupReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-16">
          <p className="font-bold text-slate-600">Loading payment status...</p>
        </main>
      }
    >
      <WalletTopupReturnContent />
    </Suspense>
  );
}
