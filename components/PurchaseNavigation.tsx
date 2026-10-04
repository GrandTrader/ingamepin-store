"use client";

import { createContext, useContext, useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type ListPosition = { page: number; height: number; scroll: number; width: number };
type Navigation = { position: ListPosition | null; setPosition: (value: ListPosition | null) => void };
const PurchaseNavigation = createContext<Navigation | null>(null);
const storageKey = "purchase-list-position";

export function PurchaseNavigationProvider({ children }: { children: ReactNode }) {
  // Retain layout measurements only, never emails, orders, or delivered codes.
  const [position, updatePosition] = useState<ListPosition | null>(null);
  const setPosition = useCallback((value: ListPosition | null) => {
    updatePosition(value);
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify({ ...value, savedAt: Date.now() }));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Navigation still works when storage is unavailable. */ }
  }, []);
  useLayoutEffect(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (value && Date.now() - value.savedAt < 15 * 60 * 1000 &&
          Number.isSafeInteger(value.page) && value.page > 0 && value.page <= 10000 &&
          Number.isFinite(value.height) && value.height >= 0 && value.height <= 20000 &&
          Number.isFinite(value.scroll) && value.scroll >= 0 && value.scroll <= 100000 &&
          value.width === window.innerWidth) {
        // Restore external browser layout state before painting the return page.
        updatePosition(value);
      }
    } catch { /* Ignore missing or invalid layout hints. */ }
  }, []);
  const navigation = useMemo(() => ({ position, setPosition }), [position, setPosition]);
  return <PurchaseNavigation.Provider value={navigation}>{children}</PurchaseNavigation.Provider>;
}

export function usePurchaseNavigation() {
  const navigation = useContext(PurchaseNavigation);
  if (!navigation) throw Error("Purchase navigation provider is required.");
  return navigation;
}
