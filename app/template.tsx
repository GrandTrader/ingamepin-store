import type { ReactNode } from "react";

export default function RootTemplate({ children }: { children: ReactNode }) {
  return <div className="page-motion flex min-h-full flex-1 flex-col">{children}</div>;
}
