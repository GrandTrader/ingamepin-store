import type { ReactNode } from "react";

const shapes = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  orders: <><path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
  wallet: <><path d="M20 8V5H6a3 3 0 0 0 0 6h15v9H6a3 3 0 0 1-3-3V8"/><path d="M21 13h-5v4h5"/></>,
  affiliate: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/></>,
  security: <><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/><path d="m8 12 3 3 5-6"/></>,
  profile: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  back: <><path d="m10 5-7 7 7 7M3 12h18"/></>,
  signout: <><path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5"/></>,
  arrow: <><path d="M3 12h18m-7-7 7 7-7 7"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  external: <><path d="M7 17 17 7M7 7h10v10"/></>,
  support: <><path d="M3 14v-2a9 9 0 0 1 18 0v5a4 4 0 0 1-4 4h-4"/><rect x="3" y="11" width="4" height="7" rx="2"/><rect x="17" y="11" width="4" height="7" rx="2"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.7-5a9 9 0 1 1 16.3-5Z"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  codes: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 5 9-5M12 12v9M7 5l10 5"/></>,
} satisfies Record<string, ReactNode>;

export type AccountIconName = keyof typeof shapes;

export default function AccountIcon({ name, className }: { name: AccountIconName; className?: string }) {
  return <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
