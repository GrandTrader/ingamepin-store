"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Receipt.module.css";

export default function CopyCodeButton({ code, label = "Copy", ariaLabel = "Copy code" }: { code: string; label?: string; ariaLabel?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    timer.current = setTimeout(() => setStatus("idle"), 3000);
  }
  return <span className={styles.copyControl}>
    <button type="button" className={styles.copyButton} onClick={copy} aria-label={ariaLabel}>{status === "copied" ? "Copied ✓" : label}</button>
    <span role="status" className={status === "error" ? styles.copyError : "sr-only"}>{status === "error" ? "Could not copy. Select the code and copy manually." : status === "copied" ? "Code copied" : ""}</span>
  </span>;
}
