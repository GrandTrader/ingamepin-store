import Link from "next/link";
import InstallCustomerAppButton from "@/components/InstallCustomerAppButton";
import AccountIcon, { type AccountIconName } from "../AccountIcon";
import CustomerAccountShell from "../CustomerAccountShell";
import CustomerPasskeyReminder from "../CustomerPasskeyReminder";
import styles from "./Dashboard.module.css";

export type DashboardOrder = {
  id: string;
  order_number: string;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  order_items: {
    id: string;
    product_name: string;
    option_name: string | null;
    denomination: number | null;
    platform: string | null;
    quantity: number;
  }[];
};

type OrderTab = { value: string; label: string };
export type DashboardViewProps = {
  displayName: string;
  wallet: { balance: number | string; currency: string };
  deliveredCodes: number;
  unreadCount: number;
  orders: DashboardOrder[];
  orderTabs: OrderTab[];
  orderCounts: Record<string, number>;
  activeTab: OrderTab;
  currentPage: number;
  pageCount: number;
  pageSize: number;
  pageNumbers: number[];
  isOrdersView: boolean;
  error?: string;
};

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "USD" }).format(Number(value));
}

function date(value: string, withTime = false) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function orderStatus(status: string): { label: string; style?: string; icon: AccountIconName } {
  switch (status) {
    case "DELIVERED": return { label: "Completed", style: styles.completed, icon: "check" };
    case "PAID": return { label: "Paid", style: styles.processing, icon: "check" };
    case "PROCESSING": return { label: "Processing", style: styles.processing, icon: "codes" };
    case "PENDING_PAYMENT": return { label: "Awaiting payment", style: styles.pending, icon: "clock" };
    case "PAYMENT_REVIEW": return { label: "Payment review", style: styles.pending, icon: "clock" };
    case "CANCELLED": return { label: "Cancelled", style: styles.cancelled, icon: "back" };
    case "REFUNDED": return { label: "Refunded", style: styles.cancelled, icon: "back" };
    default: return { label: status.replaceAll("_", " "), icon: "clock" };
  }
}

function ordersHref(status: string, page = 1) {
  return `/account/dashboard?view=orders&status=${status}&page=${page}#orders`;
}

export default function DashboardView({
  displayName, wallet, deliveredCodes, unreadCount, orders, orderTabs, orderCounts,
  activeTab, currentPage, pageCount, pageSize, pageNumbers, isOrdersView, error,
}: DashboardViewProps) {
  return (
    <CustomerAccountShell displayName={displayName} activePage={isOrdersView ? "orders" : "overview"} orderCount={orderCounts.all} unreadCount={unreadCount}>
      <div className={styles.dashboard}>
        <CustomerPasskeyReminder />
        <section id="overview">
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>My account</p>
              <h1>Hello, {displayName}</h1>
              <p className={styles.subtitle}>Your purchases, codes and wallet, all in one place.</p>
            </div>
            <div className={styles.installAction}><InstallCustomerAppButton /></div>
          </div>

          <div className={styles.summary}>
            <Link href="/account/wallet" className={`${styles.stat} ${styles.wallet}`}>
              <span className={styles.statLabel}><AccountIcon name="wallet" />Wallet balance</span>
              <strong className={styles.statValue}>{money(wallet.balance, wallet.currency)}</strong>
              <span className={styles.statAction}>Manage wallet <AccountIcon name="arrow" /></span>
            </Link>
            <Link href={ordersHref("all")} className={styles.stat}>
              <span className={styles.statLabel}><AccountIcon name="orders" />Total orders</span>
              <strong className={styles.statValue}>{orderCounts.all.toLocaleString("en-IN")}</strong>
              <span className={styles.statAction}>View purchases <AccountIcon name="arrow" /></span>
            </Link>
            <Link href={ordersHref("completed")} className={styles.stat}>
              <span className={styles.statLabel}><AccountIcon name="codes" />Delivered codes</span>
              <strong className={styles.statValue}>{deliveredCodes.toLocaleString("en-IN")}</strong>
              <span className={styles.statAction}>View delivery <AccountIcon name="arrow" /></span>
            </Link>
          </div>
        </section>

        <section id="orders" className={styles.ordersSection}>
          <div className={styles.sectionHeading}>
            <div><h2>My orders</h2><p>Keep track of your latest purchases.</p></div>
            <Link href="/track-order" className={styles.textLink}>Track an order <AccountIcon name="external" /></Link>
          </div>
          {error && <p role="alert" className={styles.notice}>{error}</p>}
          <div className={styles.ordersCard}>
            <nav className={styles.orderTabs} aria-label="Order status">
              {orderTabs.map(tab => <Link key={tab.value} href={ordersHref(tab.value)} aria-current={activeTab.value === tab.value ? "page" : undefined}>
                {tab.label}<span>{orderCounts[tab.value]}</span>
              </Link>)}
            </nav>
            {orderCounts[activeTab.value] === 0 ? (
              <div className={styles.empty}>
                <AccountIcon name="orders" />
                <h3>{activeTab.value === "all" ? "Your next game starts here" : `No ${activeTab.label.toLowerCase()} orders`}</h3>
                <p>{activeTab.value === "all" ? "Your purchases will appear here after you place an order." : "Choose another status to see your other purchases."}</p>
                <Link href={activeTab.value === "all" ? "/" : ordersHref("all")} className={styles.textLink}>{activeTab.value === "all" ? "Browse products" : "View all orders"}<AccountIcon name="arrow" /></Link>
              </div>
            ) : (
              <>
                <ul className={styles.orderList} aria-label="Recent orders">
                  {orders.map(order => {
                    const status = orderStatus(order.status);
                    return <li key={order.id}>
                      <Link href={`/account/orders/${order.id}`} className={styles.orderRow} aria-label={`View order ${order.order_number}`}>
                        <span className={styles.orderArt}><AccountIcon name="codes" /></span>
                        <div className={styles.orderDetails}>
                          {order.order_items.map(item => <div key={item.id} className={styles.orderItem}>
                            <strong>{item.product_name}</strong>
                            {(item.option_name || item.quantity > 1) && <span className={styles.option}>{item.option_name}{item.quantity > 1 ? `${item.option_name ? " · " : ""}Qty ${item.quantity}` : ""}</span>}
                          </div>)}
                          <div className={styles.orderMeta}><span>#{order.order_number}</span><time dateTime={order.created_at} title={date(order.created_at, true)}>{date(order.created_at)}</time></div>
                        </div>
                        <strong className={styles.orderPrice}>{money(order.total, order.currency)}</strong>
                        <span className={`${styles.status} ${status.style || ""}`}><AccountIcon name={status.icon} />{status.label}</span>
                        <AccountIcon name="chevron" className={styles.rowArrow} />
                      </Link>
                    </li>;
                  })}
                </ul>
                <div className={styles.pagination}>
                  <p>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, orderCounts[activeTab.value])} of {orderCounts[activeTab.value]} orders</p>
                  <nav aria-label="Order pages">
                    {currentPage > 1 && <Link href={ordersHref(activeTab.value, currentPage - 1)} aria-label="Previous order page"><AccountIcon name="back" /></Link>}
                    {pageNumbers.map((page, index) => <span key={page}>
                      {index > 0 && page - pageNumbers[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}
                      <Link href={ordersHref(activeTab.value, page)} aria-label={`Order page ${page}`} aria-current={currentPage === page ? "page" : undefined}>{page}</Link>
                    </span>)}
                    {currentPage < pageCount && <Link href={ordersHref(activeTab.value, currentPage + 1)} aria-label="Next order page"><AccountIcon name="arrow" /></Link>}
                  </nav>
                </div>
              </>
            )}
          </div>
        </section>

        <aside className={styles.help} aria-label="Customer support">
          <div className={styles.helpIdentity}><AccountIcon name="support" /><div><h2>Need a hand with an order?</h2><p>Our support team is here to help.</p></div></div>
          <Link href="/contact-us" className={styles.supportLink}><AccountIcon name="chat" />Contact support<AccountIcon name="arrow" /></Link>
        </aside>
        <div className={styles.bottom}><span>iNgamePIN · My account</span><Link href="/" className={styles.textLink}>Continue shopping <AccountIcon name="arrow" /></Link></div>
      </div>
    </CustomerAccountShell>
  );
}
