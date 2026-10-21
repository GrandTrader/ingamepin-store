import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import AdminFrame from "@/components/AdminFrame";
import AdminPagePending from "@/components/AdminPagePending";

export const metadata: Metadata = {
  applicationName: "InGamePin Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InGamePin Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f172a" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  // Keep the admin frame visible while a page is waiting for server data.
  // A shared boundary also retains the current page during client transitions.
  return <AdminFrame><Suspense fallback={<AdminPagePending />}>{children}</Suspense></AdminFrame>;
}
