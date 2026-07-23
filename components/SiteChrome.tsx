"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import Header from "./Header";
import Footer from "./Footer";

type SiteChromeProps = {
  children: ReactNode;
};

export default function SiteChrome({
  children,
}: SiteChromeProps) {
  const pathname = usePathname();
  const isAdminPage =
    pathname.startsWith("/admin");

  if (isAdminPage) {
    return (
      <main className="flex min-h-screen flex-col">
        {children}
      </main>
    );
  }

  return (
    <>
      <Header />

      <main className="flex flex-1 flex-col">
        {children}
      </main>

      <Footer />
    </>
  );
}