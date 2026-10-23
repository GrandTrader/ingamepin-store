"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { checkoutDeadline } from "@/lib/checkout-expiry";
export default function PaymentWindowNotice({ createdAt, expiresAt }: { createdAt?: string; expiresAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const seconds = createdAt && now !== null ? Math.max(0, Math.ceil((checkoutDeadline(createdAt, expiresAt) - now) / 1000)) : null;
  return <div className="my-4 rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-sm text-slate-900">
    <p className="font-bold">{seconds === 0 ? "Payment window ended — do not send a new payment" : seconds === null ? "Complete payment within 15 minutes of ordering" : `Payment time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p>
    <p className="mt-1">{seconds === 0 ? "Already paid? Check this order or submit your payment reference for review." : "Unpaid orders expire automatically so you can place a new order. Retrying does not extend this timer."}</p>
    <Link href="/track-order" className="mt-1 inline-flex min-h-11 items-center font-bold underline">View orders and retry payment</Link>
  </div>;
}
