import Link from "next/link";
import { businessSummary } from "@/lib/business-portal-data";
import { usd } from "@/lib/business-portal";
import { customerLogout } from "../actions";
import PortalNav from "./PortalNav";
import s from "./Portal.module.css";
export const dynamic = "force-dynamic";
export default async function BusinessPortalLayout({children}:{children:React.ReactNode}) {
  const data=await businessSummary();
  return <main className={s.portal}><header className={s.header}><div className={s.identity}><span className={s.logo}>iP</span><div><p className={s.eyebrow}>InGamePIN · Business portal</p><h1>{data.name}</h1><p className={s.muted}>Verified business · {data.tier}</p></div></div><div className={s.actions}><Link className={s.button} href="/">Visit store ↗</Link><form action={customerLogout}><button className={s.button}>Log out</button></form></div></header><div className={s.stats}><section className={s.card}><p className={s.eyebrow}>Wallet balance</p><p className={s.statValue}>{new Intl.NumberFormat("en-US",{style:"currency",currency:data.wallet.currency}).format(Number(data.wallet.balance))}</p><Link className={s.link} href="/account/wallet">Add funds →</Link></section><section className={s.card}><p className={s.eyebrow}>Purchases · {data.label}</p><p className={s.statValue}>{usd(data.spent)}</p><p className={s.muted}>Net paid merchandise in USD</p></section><section className={s.card}><div className={s.titleLine}><p className={s.eyebrow}>Your monthly tier</p><span className={s.badge}>{data.tier}</span></div><progress className={s.progress} max={100} value={data.progress} aria-label="Progress towards reseller threshold"/><p className={s.muted}>{data.remaining ? `${usd(data.remaining)} more to reach Reseller this month.` : "You have reached the $5,000 monthly reseller minimum."}</p><p className={s.helper}>Recalculated from current-month purchases. Month resets in India time.</p></section></div><PortalNav/>{children}</main>;
}
