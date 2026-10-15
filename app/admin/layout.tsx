import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AdminFrame from "@/components/AdminFrame";

export const metadata: Metadata = {
  applicationName: "InGamePin Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InGamePin Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f172a" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
