"use client";

import { useState, type ReactNode } from "react";
import s from "./Portal.module.css";

export default function OrderFilters({ children, active }: { children: ReactNode; active: boolean }) {
  const [expanded, setExpanded] = useState(active);
  return <div className={s.filterDisclosure}>
    <button className={s.button} type="button" aria-expanded={expanded} aria-controls="portal-order-filters" onClick={() => setExpanded(!expanded)}>
      {active ? "Date / status filters applied" : "Filter by date or status"}<span aria-hidden="true">{expanded ? "−" : "+"}</span>
    </button>
    <div id="portal-order-filters" className={s.filterFields} data-expanded={expanded}>{children}</div>
  </div>;
}
