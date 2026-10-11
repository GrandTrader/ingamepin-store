import styles from "./StorefrontLoading.module.css";

export default function StorefrontLoading({ variant = "page" }: { variant?: "page" | "product" | "catalog" }) {
  return <section className={styles.root} aria-busy="true" aria-label={variant === "product" ? "Loading product" : "Loading page"} data-storefront-loading={variant}>
    <p role="status" className={styles.status}>Loading {variant === "product" ? "product" : "page"}…</p>
    <div aria-hidden="true">
      <div className={`${styles.bar} ${styles.breadcrumb}`} />
      {variant === "product" ? <>
        <div className={styles.identity}><div className={styles.cover} /><div><div className={styles.bar} /><div className={`${styles.bar} ${styles.title}`} /><div className={styles.bar} /></div></div>
        <div className={styles.panel}><div><div className={styles.bar} /><div className={styles.options}>{Array.from({length:6},(_,i)=><div key={i} className={styles.option}/>)}</div><div className={styles.field}/><div className={styles.field}/></div><div className={styles.summary}><div className={styles.bar}/><div className={styles.total}/><div className={styles.button}/><div className={styles.button}/></div></div>
      </> : variant === "catalog" ? <><div className={`${styles.bar} ${styles.title}`} /><div className={styles.cards}>{Array.from({length:12},(_,i)=><div key={i} className={styles.card}><div className={styles.square}/><div className={styles.bar}/><div className={styles.bar}/></div>)}</div></> : <div className={styles.general}><div className={`${styles.bar} ${styles.title}`}/><div className={styles.bar}/><div className={styles.field}/><div className={styles.field}/></div>}
    </div>
  </section>;
}
