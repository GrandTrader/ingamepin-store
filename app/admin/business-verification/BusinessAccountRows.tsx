import Link from "next/link";
import s from "./BusinessAccountRows.module.css";
type Row={id:string;businessName:string;name:string;email:string;createdAt:string;status:string};
export default function BusinessAccountRows({rows}:{rows:Row[]}) {
  return <div className={s.list}>{rows.map(row=><article className={s.row} key={row.id}>
    <div className={s.identity}><strong title={row.businessName}>{row.businessName}</strong><span title={row.name}>{row.name}</span></div>
    <a className={s.email} href={`mailto:${row.email}`} title={row.email}>{row.email}</a>
    <time className={s.date} dateTime={row.createdAt}><span>Created (IST)</span>{new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(row.createdAt))}</time>
    <span className={s.status}>{row.status}</span>
    <Link className={s.button} href={`/admin/business-verification/${row.id}`}>Details <span aria-hidden="true">→</span></Link>
  </article>)}</div>;
}
