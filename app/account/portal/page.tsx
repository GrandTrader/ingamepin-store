import Link from "@/components/NavigationLink";
import Form from "next/form";
import OrderFilters from "./OrderFilters";
import { portalCustomer, customerOrders, type PortalFilters } from "@/lib/business-portal-data";
import { portalDate, portalPage } from "@/lib/business-portal";
import { Pagination, Status } from "./Shared";
import s from "./Portal.module.css";
export default async function PortalOrders({searchParams}:{searchParams:Promise<PortalFilters>}) {
  const filters=await searchParams, page=portalPage(filters.page); const {email}=await portalCustomer();
  const result=await customerOrders(email,filters).range((page-1)*20,page*20-1);
  if(result.error) throw Error("Unable to load business orders. Please try again.");
  const query=new URLSearchParams();for(const [k,v] of Object.entries(filters))if(v&&k!=="page")query.set(k,v);query.set("kind","orders");
  return <>
    <div className={s.titleLine}>
      <h2>Order history</h2>
      <div className={s.actions}>
        <a className={s.button} href={`/account/portal/export?${query}`}>↓ Export orders (CSV)</a>
        <Link className={s.primary} href="/account/portal/new" scroll={false}>＋ New order</Link>
      </div>
    </div>
    <Form action="/account/portal" scroll={false} className={`${s.toolbar} ${s.orderFilters}`}>
      <label className={s.search}>Order number<input name="q" defaultValue={filters.q} placeholder="Search order number"/></label>
      <button className={`${s.button} ${s.mobileSearch}`}>Search</button>
      <OrderFilters active={!!(filters.from||filters.to||filters.status)}>
        <label>From (India time)<input name="from" type="date" defaultValue={filters.from}/></label>
        <label>To<input name="to" type="date" defaultValue={filters.to}/></label>
        <label>Status<select name="status" defaultValue={filters.status??""}>
          <option value="">All orders</option>
          {["DELIVERED","PAID","PROCESSING","PENDING_PAYMENT","PAYMENT_REVIEW","CANCELLED","REFUNDED"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
        </select></label>
        <button className={s.button}>Filter</button>
        <Link className={s.button} href="/account/portal" scroll={false}>Reset</Link>
      </OrderFilters>
    </Form>
    <div className={s.tableWrap}>
      <table className={`${s.table} ${s.mobileTable} ${s.historyTable}`}>
        <thead><tr><th>Order / date (IST)</th><th>Product / denomination</th><th>Quantity</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead>
        {result.data.map(order=><tbody key={order.id}>
          {(order.order_items.length?order.order_items:[null]).map(item=><tr className={s.historyEntry} key={item?.id??order.id}>
            <td data-label="Order / date (IST)" className={s.historyReference}>
              <Link className={s.link} href={`/account/portal/orders/${order.id}`}>{order.order_number}</Link>
              <p className={s.muted}>{portalDate(order.created_at)}</p>
            </td>
            <td data-label="Product / denomination" className={`${s.itemName} ${s.historyProduct}`}>
              {item?.product_name??"No product details"}
              {item?.option_name&&<p className={s.muted}>{item.option_name}</p>}
            </td>
            <td data-label="Quantity">{item?.quantity??"—"}</td>
            <td data-label="Status"><Status value={order.status}/></td>
            <td data-label="Amount">
              <div className={s.money}>{new Intl.NumberFormat("en-US",{style:"currency",currency:order.currency}).format(Number(order.total))}</div>
              {order.order_items.length>1&&<p className={s.muted}>Order total</p>}
            </td>
            <td data-label="Actions" className={s.historyActionCell}>
              <div className={s.historyActions}>
                <Link className={s.button} href={`/account/portal/orders/${order.id}`}>View</Link>
                {order.status==="DELIVERED"
                  ? <Link className={`${s.button} ${s.invoiceButton}`} href={`/account/portal/orders/${order.id}/invoice`}>Invoice</Link>
                  : <span className={`${s.button} ${s.invoiceButton}`} aria-disabled="true" title="Invoice available after the order is delivered">Invoice</span>}
                {item&&["PAID","PROCESSING","DELIVERED"].includes(order.status)&&<>
                  <a className={s.button} href={`/account/portal/export?kind=codes&order=${order.id}&item=${item.id}`}>CSV</a>
                  <a className={s.button} href={`/account/portal/export?kind=codes&order=${order.id}&item=${item.id}&format=txt`}>TXT</a>
                </>}
              </div>
            </td>
          </tr>)}
        </tbody>)}
      </table>
      {!result.data.length&&<div className={s.empty}>No orders match your filters.</div>}
    </div>
    <Pagination page={page} count={result.count??0} base="/account/portal" params={filters}/>
    <p className={s.helper}>Code downloads contain delivered codes only. CSV files open in Excel.</p>
  </>;
}
