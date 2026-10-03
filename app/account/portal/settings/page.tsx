import Link from "@/components/NavigationLink";
import { portalCustomer } from "@/lib/business-portal-data";
import s from "../Portal.module.css";
const links = [
  ["API documentation", "Connect your website to the InGamePin ordering API.", "/account/portal/api-docs", "Open docs", "‹›"],
  ["API access", "Manage API keys, allowed IPs and ordering permissions.", "/account/portal/api-access", "Manage", "⚿"],
  ["Profile", "Manage your account name, email and phone number.", "/account/portal/profile", "Manage", "◎"],
  ["Account security", "Manage passkeys for your account.", "/account/portal/security", "Manage", "◇"],
  ["Business verification", "View your approved business details and bank deposits.", "/account/portal/business", "View", "✓"],
  ["Wallet", "Add funds to the balance shared by retail and business purchases.", "/account/portal/wallet", "Add funds", "+"],
  ["Wallet statement", "View and download activity for your shared wallet.", "/account/portal/statement", "View", "↓"],
];
export default async function PortalSettings(){
  await portalCustomer();
  return <section className={s.settings}><div className={s.titleLine}><h2>Settings</h2><Link href="/account/portal" scroll={false} className={s.button}>← Back</Link></div><p className={s.eyebrow}>Account &amp; preferences</p><div className={s.settingsList}>{links.map(([title,description,href,action,icon])=><article className={s.settingsCard} key={href}><span className={s.settingsIcon} aria-hidden="true">{icon}</span><div><h3>{title}</h3><p className={s.muted}>{description}</p></div><Link href={href} scroll={false} className={s.primary}>{action} →</Link></article>)}</div></section>;
}
