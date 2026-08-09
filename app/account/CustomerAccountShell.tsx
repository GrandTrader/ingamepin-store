import type { ReactNode } from "react";

import CustomerAccountNav from "./CustomerAccountNav";

export default function CustomerAccountShell({
  displayName,
  children,
}: {
  displayName: string;
  children: ReactNode;
}) {
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <main className="min-w-0 max-w-full overflow-x-hidden bg-slate-100 text-slate-950">
      <div className="mx-auto grid min-h-[75vh] w-full min-w-0 max-w-7xl md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="min-w-0 max-w-full overflow-hidden border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r md:p-5">
          <div className="flex min-w-0 items-center gap-3 px-2 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500 font-black text-slate-950">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-black">{displayName}</p>
              <p className="truncate text-xs text-slate-500">Customer</p>
            </div>
          </div>

          <CustomerAccountNav />
        </aside>

        <section className="min-w-0 max-w-full overflow-hidden p-4 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
