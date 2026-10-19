import Link from "@/components/NavigationLink";
import { customerDetailDisplay } from "@/lib/sensitive-customer-fields";
import { groupOrderItems, orderDeliveryLabel, orderItemLabel, orderStatusLabel, type AdminOrder } from "@/lib/admin-order-display";
import AdminOrderLink from "../AdminOrderLink";
import styles from "./Orders.module.css";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));
}

export default function AdminOrdersList({ orders, customerIds }: { orders: AdminOrder[]; customerIds: Map<string, string> }) {
  return <div className={styles.list}>
    <div className={styles.columns} aria-hidden="true">
      <span>Order / customer</span><span>Product / quantity</span><span>Amount</span><span>Status</span><span />
    </div>
    {orders.map(order => {
      const groups = groupOrderItems(order.order_items);
      const quantity = groups.reduce((sum, group) => sum + group.quantity, 0);
      const customerId = customerIds.get(order.customer_email.trim().toLowerCase());
      const delivery = orderDeliveryLabel(order.order_items);
      const optionCount = new Set(order.order_items.map(item => JSON.stringify([item.product_id, item.product_option_id, orderItemLabel(item)]))).size;
      const productLabel = groups.length > 1 ? `${groups[0].name} + ${groups.length - 1} more` : groups[0]?.name ?? "Order details";
      return <article key={order.id} id={`order-${order.id}`} className={styles.order} aria-label={`Order ${order.order_number}`}>
        <details className={styles.details}>
          <summary className={styles.row}>
            <span className={styles.identity}>
              <AdminOrderLink orderId={order.id} orderNumber={order.order_number} className={styles.orderNumber} />
              {order.customer_name && <span className={styles.customerName}>{order.customer_name}</span>}
              {customerId ? <Link prefetch={false} href={`/admin/customers/${encodeURIComponent(customerId)}`} className={styles.email}>{order.customer_email}</Link> : <span className={styles.email}>{order.customer_email}</span>}
              <time className={styles.date} dateTime={order.created_at}>{dateLabel(order.created_at)} IST</time>
            </span>
            <span className={styles.product}>
              <strong>{productLabel}</strong>
              <span className={styles.expandLabel}>
                {groups.length > 1 ? `${groups.length} products` : `${optionCount} ${optionCount === 1 ? "option" : "denominations"}`} · Qty {quantity.toLocaleString("en-IN")}
                <span className={styles.chevron} aria-hidden="true" />
              </span>
              {delivery && <span className={styles.delivery}>{delivery}</span>}
              {order.order_items.some(item => Number(item.affiliate_commission_percent) > 0) && <span className={styles.affiliate}>Affiliate sale</span>}
            </span>
            <span className={styles.amount}>
              {new Intl.NumberFormat("en-IN", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total))}
              <small>{order.currency || "USD"}</small>
            </span>
            <span className={styles.status} data-status={order.status}>{orderStatusLabel(order.status)}</span>
            <Link prefetch={false} href={`/admin/orders/${encodeURIComponent(order.id)}/receipt`} className={styles.openOrder} aria-label={`Open order ${order.order_number}`}>Open <span aria-hidden="true">↗</span></Link>
          </summary>
          <div className={styles.expanded}>
            {groups.map(group => <section key={group.key} className={styles.productGroup} aria-label={group.name}>
              <div className={styles.groupHeading}><h3>{group.name}</h3><span>Qty {group.quantity.toLocaleString("en-IN")}</span></div>
              <div className={styles.denominations}>
                {group.items.map(item => <div key={item.id} className={styles.denomination}>
                  <div className={styles.optionHeading}><strong>{orderItemLabel(item)}</strong><span>× {item.quantity.toLocaleString("en-IN")}</span></div>
                  {item.platform && <p>Platform: {item.platform}</p>}
                  {item.fulfillment_mode && <p>{item.fulfillment_mode.replaceAll("_", " ")}</p>}
                  {Number(item.affiliate_commission_percent) > 0 && <p className={styles.affiliate}>Affiliate sale · {Number(item.affiliate_commission_percent)}%</p>}
                  {item.player_id && <p>Player ID: <strong>{item.player_id}</strong></p>}
                  {(item.customer_information ?? []).map((field, index) => <p key={`${field.fieldId}-${index}`}>{field.label}: <strong>{customerDetailDisplay(field)}</strong></p>)}
                </div>)}
              </div>
            </section>)}
            <div className={styles.timeline}>
              <span>Ordered <time dateTime={order.created_at}>{dateLabel(order.created_at)} IST</time></span>
              {order.paid_at && <span>Paid <time dateTime={order.paid_at}>{dateLabel(order.paid_at)} IST</time></span>}
              {order.delivered_at && <span>Completed <time dateTime={order.delivered_at}>{dateLabel(order.delivered_at)} IST</time></span>}
            </div>
          </div>
        </details>
      </article>;
    })}
  </div>;
}
