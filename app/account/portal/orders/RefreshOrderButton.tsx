"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Portal.module.css";

export default function RefreshOrderButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.button}
      style={{ minWidth: 112 }}
      disabled={pending}
      aria-busy={pending}
      title="Refresh order status and delivered codes"
      onClick={() => startTransition(() => router.refresh())}
    >
      <span aria-live="polite">{pending ? "Refreshing..." : "Refresh"}</span>
    </button>
  );
}
