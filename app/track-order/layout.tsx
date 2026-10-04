import { PurchaseNavigationProvider } from "@/components/PurchaseNavigation";
import type { ReactNode } from "react";

export default function PurchaseLayout({ children }: { children: ReactNode }) {
  return <PurchaseNavigationProvider>{children}</PurchaseNavigationProvider>;
}
