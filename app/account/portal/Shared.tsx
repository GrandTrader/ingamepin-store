import Link from "@/components/NavigationLink";
import s from "./Portal.module.css";
export function Status({value}:{value:string}) { return <span className={`${s.badge} ${["REFUNDED","CANCELLED"].includes(value)?s.cancelled:!["DELIVERED","CREDIT"].includes(value)?s.pending:""}`}>{value.replaceAll("_"," ").toLowerCase()}</span>; }
export function Pagination({page,count,base,params}:{page:number;count:number;base:string;params:Record<string,string|undefined>}) {
  const total=Math.max(1,Math.ceil(count/20)); const href=(n:number)=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v&&k!=="page")q.set(k,v);q.set("page",String(n));return base+"?"+q;};
  return <div className={s.pagination}><span>{count} records · Page {page} of {total}</span><div className={s.actions}>{page>1&&<Link className={s.button} href={href(page-1)} scroll={false}>← Previous</Link>}{page<total&&<Link className={s.button} href={href(page+1)} scroll={false}>Next →</Link>}</div></div>;
}
