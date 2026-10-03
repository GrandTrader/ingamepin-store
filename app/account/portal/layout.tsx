import Link from "@/components/NavigationLink";
import { businessSummary } from "@/lib/business-portal-data";
import { usd } from "@/lib/business-portal";
import { customerLogout } from "../actions";
import PortalNav from "./PortalNav";
import PortalHeader from "./PortalHeader";
import s from "./Portal.module.css";
export const dynamic = "force-dynamic";
export default async function BusinessPortalLayout({children}:{children:React.ReactNode}) {
  const data=await businessSummary();
  return <div className={s.portal}>
    <PortalHeader name={data.name} logout={<form action={customerLogout}><button className={s.button}>Log out</button></form>}>
    <div className={s.stats}>
      <section className={s.card}><p className={s.eyebrow}>Shared wallet balance</p><p className={s.statValue}>{new Intl.NumberFormat("en-US",{style:"currency",currency:data.wallet.currency}).format(Number(data.wallet.balance))}</p><Link className={s.link} href="/account/portal/wallet" scroll={false}>Add funds →</Link></section>
      <section className={s.card}><p className={s.eyebrow}>Business purchases · {data.label}</p><p className={s.statValue}>{usd(data.spent)}</p><p className={s.muted}>This month, after refunds</p></section>
      <section className={s.card}><p className={s.eyebrow}>Account tier</p><p className={s.statValue}>{data.tier}</p><p className={s.muted}>{data.remaining ? `${usd(data.remaining)} to reach Reseller this month.` : "$5,000 monthly reseller minimum reached."}</p></section>
    </div>
    </PortalHeader>
    <PortalNav/><main className={s.content}>{children}</main>
    <footer className={s.footer}><span>InGamePIN Business</span><Link href="/account/portal/settings" scroll={false}>Settings</Link><Link href="/account/portal/business" scroll={false}>Business verification</Link><Link href="/account/dashboard">Switch to Retail</Link></footer>
  </div>;
}
