"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

type Props = ComponentProps<typeof Link> & { warm?: "visible" | "intent" };

// Fully prefetch editor routes, rather than only their dynamic route shell.
// Catalogue links and supplier integrations wait for intent to avoid a request
// for every product or an external supplier lookup just from opening the list.
export default function ProductEditorLink({
  warm = "intent", onMouseEnter, onFocus, onTouchStart, ...props
}: Props) {
  const [intent, setIntent] = useState(false);
  return <Link
    {...props}
    prefetch={warm === "visible" || intent}
    onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
    onFocus={(event) => { setIntent(true); onFocus?.(event); }}
    onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
  />;
}
