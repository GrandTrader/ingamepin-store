"use client";
import { useEffect, useState } from "react";
export function usePromotionClock(expiries: Array<string | null | undefined>) {
  const [now, setNow] = useState(() => Date.now());
  const key = expiries.filter(Boolean).join("|");
  useEffect(() => {
    const future = key.split("|").map(Date.parse).filter(value => value > now);
    const refresh = () => setNow(Date.now());
    const timer = future.length ? setTimeout(refresh, Math.min(2147483647, Math.max(1, Math.min(...future) - Date.now() + 20))) : undefined;
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [key, now]);
  return now;
}
