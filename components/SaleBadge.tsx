import styles from "./SaleBadge.module.css";

export default function SaleBadge({ percent, label = "Save" }: { percent: number; label?: string }) {
  return <span className={`sale-badge ${styles.saleBadge}`}>{label} {percent}%</span>;
}
