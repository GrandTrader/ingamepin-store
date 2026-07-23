import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import Header from "../components/Header";
import Footer from "../components/Footer";

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
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${robotoMono.variable} flex min-h-screen flex-col bg-slate-950 antialiased`}
      >
        <Header />

        <main className="flex flex-1 flex-col">
          {children}
        </main>

        <Footer />

        <SpeedInsights />
      </body>
    </html>
  );
}