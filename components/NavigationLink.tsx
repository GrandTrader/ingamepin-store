"use client";
import Link, { useLinkStatus } from "next/link";
import { canPrefetchPage } from "@/lib/navigation-prefetch";
import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import styles from "./NavigationLink.module.css";

function PendingHint() {
  const { pending } = useLinkStatus();
  return pending ? createPortal(<span role="status" aria-label="Opening page" className={styles.pending} />, document.body) : null;
}
export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const admin = typeof props.href === "string" && (props.href === "/admin" || props.href.startsWith("/admin/"));
  // Eligible public routes use full preparation. Other/future routes keep Next's default.
  const fullPreparation = typeof props.href === "string" && canPrefetchPage(props.href, "https://www.ingamepin.com");
  return <Link {...props} prefetch={props.prefetch ?? (admin ? intent : fullPreparation ? false : undefined)} onMouseEnter={(event) => { if (admin) setIntent(true); props.onMouseEnter?.(event); }} onFocus={(event) => { if (admin) setIntent(true); props.onFocus?.(event); }} onTouchStart={(event) => { if (admin) setIntent(true); props.onTouchStart?.(event); }} data-store-prefetch={props.prefetch === false ? "off" : undefined}>{children}<PendingHint /></Link>;
}
