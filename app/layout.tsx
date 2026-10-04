import StorefrontFrame from "@/components/StorefrontFrame";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";
import StoreAnalytics from "@/components/StoreAnalytics";

import NavigationWarmup from "../components/NavigationWarmup";
import Header from "../components/Header";
import MobileBottomNav from "../components/MobileBottomNav";
import Footer from "../components/Footer";
import LiveSupportWidget from "../components/LiveSupportWidget";
import WebsiteTranslator from "../components/WebsiteTranslator";
import { StorePreferencesProvider } from "../components/StorePreferences";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
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
          <StorefrontFrame
            header={<><Suspense fallback={null}><SeasonalFall /></Suspense><Header /></>}
            footer={<Footer />}
            extras={<><Suspense fallback={null}><MobileBottomNav /></Suspense><LiveSupportWidget /></>}
          >{children}</StorefrontFrame>
        </StorePreferencesProvider>

        <StoreAnalytics nonce={nonce} />
      </body>
    </html>
  );
}
