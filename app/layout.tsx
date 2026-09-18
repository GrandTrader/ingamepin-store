import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import NavigationWarmup from "../components/NavigationWarmup";
import Header from "../components/Header";
import MobileBottomNav from "../components/MobileBottomNav";
import Footer from "../components/Footer";
import LiveSupportWidget from "../components/LiveSupportWidget";
import YandexMetrica from "../components/YandexMetrica";
import WebsiteTranslator from "../components/WebsiteTranslator";
import { StorePreferencesProvider } from "../components/StorePreferences";
import GoogleAdsTag from "../components/GoogleAdsTag";
import SeasonalFall from "../components/SeasonalFall";

import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "InGamePin | Gaming Gift Cards & Digital Products",
    template: "%s | InGamePin",
  },
  description:
    "Buy PlayStation, Xbox, Steam, Apple Gift Cards, Game Top-Ups and Digital Products with fast and secure delivery.",
  keywords: [
    "InGamePin",
    "Gaming Gift Cards",
    "PlayStation Gift Cards",
    "Xbox Gift Cards",
    "Steam Wallet",
    "Apple Gift Cards",
    "Game Top Up",
    "Digital Products",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-store-theme="light"
      style={{ colorScheme: "light" }}
    >
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${robotoMono.variable} flex min-h-screen flex-col bg-slate-950 antialiased`}
      >
        <StorePreferencesProvider>
          <WebsiteTranslator />
          <NavigationWarmup />
          <Suspense fallback={null}>
            <SeasonalFall />
          </Suspense>
          <Header />

          <main className="flex flex-1 flex-col">
            {children}
          </main>

          <Footer />
          <Suspense fallback={null}><MobileBottomNav /></Suspense>
          <LiveSupportWidget />
        </StorePreferencesProvider>

        <YandexMetrica />
        <GoogleAdsTag />

        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
