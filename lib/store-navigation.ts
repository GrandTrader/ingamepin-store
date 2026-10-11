"use client";
export type StoreNavigation = {
  categories: Array<{ id: string; name: string; slug: string }>;
  featured: Array<{ id: string; name: string; shortName: string | null; slug: string; icon: string | null; sales: number }>;
};
let pending: Promise<StoreNavigation> | undefined;
let expires = 0;
// Only public menu labels are shared. No account, price or wallet data is stored here.
export function getStoreNavigation() {
  if (!pending || Date.now() >= expires) {
    expires = Date.now() + 30000;
    pending = fetch("/api/store/navigation", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error("Unable to load store navigation.");
      return await response.json() as StoreNavigation;
    }).catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
