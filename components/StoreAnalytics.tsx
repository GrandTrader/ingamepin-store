"use client";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import YandexMetrica from "@/components/YandexMetrica";
import GoogleAdsTag from "@/components/GoogleAdsTag";

export default function StoreAnalytics({ nonce }: { nonce?: string }) {
  const pathname = usePathname();
  // Never initialize recording/marketing tags on pages containing OTPs, codes or account data.
  if (/^\/(account|admin|checkout|track-order|seller|vendor)(\/|$)/.test(pathname)) return null;
  return <><YandexMetrica nonce={nonce} /><GoogleAdsTag nonce={nonce} /><Analytics /><SpeedInsights /></>;
}
