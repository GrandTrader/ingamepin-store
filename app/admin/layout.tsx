import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AdminPwaRegister from "@/components/AdminPwaRegister";

export const metadata: Metadata = {
  applicationName: "InGamePin Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InGamePin Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f172a" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <><AdminPwaRegister /><div className="admin-responsive-shell w-full min-w-0 max-w-full overflow-x-hidden">{children}</div></>;
}
