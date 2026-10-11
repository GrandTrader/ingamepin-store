"use client";
import Link, { useLinkStatus } from "next/link";
import { canPrefetchPage } from "@/lib/navigation-prefetch";
import type { ComponentProps } from "react";
import { createPortal } from "react-dom";
import styles from "./NavigationLink.module.css";

function PendingHint() {
  const { pending } = useLinkStatus();
  return pending ? createPortal(<span role="status" aria-label="Opening page" className={styles.pending} />, document.body) : null;
}
export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  // Eligible public routes use full preparation. Other/future routes keep Next's default.
  const fullPreparation = typeof props.href === "string" && canPrefetchPage(props.href, "https://www.ingamepin.com");
  return <Link {...props} prefetch={props.prefetch ?? (fullPreparation ? false : undefined)} data-store-prefetch={props.prefetch === false ? "off" : undefined}>{children}<PendingHint /></Link>;
}
