"use client";

import Link, { useLinkStatus } from "next/link";

function PendingTab() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="Opening tab" className="ml-1 inline-block h-2 w-2 rounded-full bg-current" /> : null;
}
import { useState, type ComponentProps } from "react";

type Props = ComponentProps<typeof Link> & { warm?: "visible" | "intent" };

// Fully prefetch editor routes, rather than only their dynamic route shell.
// Catalogue links and supplier integrations wait for intent to avoid a request
// for every product or an external supplier lookup just from opening the list.
export default function ProductEditorLink({
  warm = "intent", onMouseEnter, onFocus, onTouchStart, children, ...props
}: Props) {
  const [intent, setIntent] = useState(false);
  return <Link
    {...props}
    prefetch={warm === "visible" || intent}
    onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
    onFocus={(event) => { setIntent(true); onFocus?.(event); }}
    onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
  >{children}<PendingTab /></Link>;
}
