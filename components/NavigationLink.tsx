"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { createPortal } from "react-dom";
import styles from "./NavigationLink.module.css";

function PendingHint() {
  const { pending } = useLinkStatus();
  return pending ? createPortal(<span role="status" aria-label="Opening page" className={styles.pending} />, document.body) : null;
}
export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<PendingHint /></Link>;
}
