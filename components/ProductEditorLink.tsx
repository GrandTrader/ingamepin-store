"use client";

import Link, { useLinkStatus } from "next/link";

function PendingTab() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="Opening tab" className="ml-1 inline-block h-2 w-2 rounded-full bg-current" /> : null;
}
import { useEffect, useRef, useState, type ComponentProps } from "react";

type Props = ComponentProps<typeof Link> & { warm?: "visible" | "intent" };

// Fully prefetch editor routes, rather than only their dynamic route shell.
// Catalogue links and supplier integrations wait for intent to avoid a request
// for every product or an external supplier lookup just from opening the list.
export default function ProductEditorLink({
  warm = "intent", onMouseEnter, onFocus, onTouchStart, children, ...props
}: Props) {
  const element = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [intent, setIntent] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    setAutomatic(!connection?.saveData && !/(^|-)2g$/.test(connection?.effectiveType ?? ""));
  }, []);
  useEffect(() => {
    if (warm !== "visible" || !automatic || !element.current) return;
    // Observe the actual clipped tab, without Next's wider prefetch margin.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [warm, automatic]);
  return <Link
    {...props}
    ref={element}
    prefetch={(warm === "visible" && automatic && visible) || intent}
    onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
    onFocus={(event) => { setIntent(true); onFocus?.(event); }}
    onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
  >{children}<PendingTab /></Link>;
}
