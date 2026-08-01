import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AccountPwaRegister from "@/components/AccountPwaRegister";

export const metadata: Metadata = { applicationName: "InGamePin Customer", manifest: "/account/manifest.webmanifest", appleWebApp: { capable: true, title: "InGamePin", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { themeColor: "#0f172a" };
export default function AccountLayout({ children }: { children: ReactNode }) { return <><AccountPwaRegister />{children}</>; }
