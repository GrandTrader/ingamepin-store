import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { customerLogout } from "../actions";

export const dynamic = "force-dynamic";

type OrderItem = {
  id: string;
  product_name: string;
  option_name: string | null;
  denomination: number | null;
  platform: string | null;
  quantity: number;
};

type CustomerOrder = {
  id: string;
  order_number: string;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  order_items: OrderItem[];
};

function formatMoney(value: number | string, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "DELIVERED") return "bg-emerald-100 text-emerald-700";
  if (status === "PAID" || status === "PROCESSING") return "bg-blue-100 text-blue-700";
  if (status === "PAYMENT_REVIEW") return "bg-amber-100 text-amber-700";
  if (status === "CANCELLED" || status === "REFUNDED") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) redirect("/account?error=Please sign in to continue.");

  const admin = createAdminClient();
  const [walletResult, notificationResult, orderResult] = await Promise.all([
    supabase
      .from("customer_wallets")
      .select("balance, currency")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("customer_notifications")
      .select("id, notification_type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("orders")
      .select(`
        id,
        order_number,
        total,
        currency,
        status,
        created_at,
        delivered_at,
        order_items (
          id,
          product_name,
          option_name,
          denomination,
          platform,
          quantity
        )
      `)
      .eq("customer_email", user.email.toLowerCase())
      .order("created_at", { ascending: false }),
  ]);

  const orders = (orderResult.data ?? []) as CustomerOrder[];
  const orderItems = orders.flatMap((order) => order.order_items);
  const orderItemIds = orderItems.map((item) => item.id);
  const codeResult = orderItemIds.length
    ? await admin
        .from("gift_card_codes")
        .select("id, order_item_id, code, sold_at")
        .in("order_item_id", orderItemIds)
        .eq("status", "SOLD")
        .order("sold_at", { ascending: false })
    : { data: [], error: null };

  const codes = (codeResult.data ?? []).map((code) => {
    const item = orderItems.find((orderItem) => orderItem.id === code.order_item_id);
    const order = orders.find((customerOrder) =>
      customerOrder.order_items.some((orderItem) => orderItem.id === code.order_item_id),
    );
    return {
      ...code,
      productName: item?.product_name ?? "Digital product",
      optionName: item?.option_name ?? null,
      orderNumber: order?.order_number ?? "Order",
    };
  });

  const wallet = walletResult.data ?? { balance: 0, currency: "INR" };
  const notifications = notificationResult.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const displayName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    user.email.split("@")[0];
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <main className="bg-slate-100 text-slate-950">
      <div className="mx-auto grid min-h-[75vh] max-w-7xl md:grid-cols-[230px_1fr]">
        <aside className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r md:p-5">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 font-black text-slate-950">{initials}</div>
            <div className="min-w-0"><p className="truncate font-black">{displayName}</p><p className="truncate text-xs text-slate-500">Customer</p></div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto md:grid md:overflow-visible">
            <Link href="#overview" className="whitespace-nowrap rounded-xl bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700">Overview</Link>
            <Link href="#orders" className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">My orders</Link>
            <Link href="#codes" className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">My codes</Link>
            <Link href="/account/wallet" className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">Wallet</Link>
            <Link href="#notifications" className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}</Link>
            <Link href="#profile" className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">Profile</Link>
          </nav>
        </aside>

        <div className="min-w-0 p-5 sm:p-8">
          <section id="overview" className="scroll-mt-40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">My account</p><h1 className="mt-2 text-3xl font-black">Hello, {displayName}</h1><p className="mt-2 text-slate-500">Manage purchases, codes, notifications and wallet balance.</p></div>
              <form action={customerLogout}><button className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold" type="submit">Sign out</button></form>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <Link href="/account/wallet" className="scroll-mt-40 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-400"><p className="text-sm text-slate-500">Wallet balance</p><p className="mt-2 text-3xl font-black text-cyan-600">{formatMoney(wallet.balance, wallet.currency)}</p><p className="mt-2 text-xs font-bold text-cyan-600">Add money or view transactions →</p></Link>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Total orders</p><p className="mt-2 text-3xl font-black">{orders.length}</p><p className="mt-2 text-xs text-slate-400">Orders using {user.email}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Delivered codes</p><p className="mt-2 text-3xl font-black text-emerald-600">{codes.length}</p><p className="mt-2 text-xs text-slate-400">Available securely below</p></div>
            </div>
          </section>

          <section id="orders" className="mt-10 scroll-mt-40">
            <div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black">My orders</h2><p className="mt-1 text-sm text-slate-500">Newest purchases appear first.</p></div><Link href="/track-order" className="text-sm font-bold text-cyan-600">Track an order</Link></div>
            {orders.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-7 text-center text-slate-500">No orders found for this email address.</div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Products</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Date</th></tr></thead><tbody className="divide-y divide-slate-200">{orders.map((order) => <tr key={order.id}><td className="px-5 py-5 font-bold text-cyan-700">{order.order_number}</td><td className="px-5 py-5">{order.order_items.map((item) => <p key={item.id}>{item.product_name}{item.option_name ? ` - ${item.option_name}` : ""}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</p>)}</td><td className="px-5 py-5 font-bold">{formatMoney(order.total, order.currency)}</td><td className="px-5 py-5"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(order.status)}`}>{order.status === "DELIVERED" ? "COMPLETED" : order.status.replaceAll("_", " ")}</span></td><td className="px-5 py-5 text-slate-500">{formatDate(order.created_at)}</td></tr>)}</tbody></table></div>
              </div>
            )}
          </section>

          <section id="codes" className="mt-10 scroll-mt-40">
            <h2 className="text-2xl font-black">My delivered codes</h2><p className="mt-1 text-sm text-slate-500">Keep codes private and redeem them only on the official platform.</p>
            {codes.length === 0 ? <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-7 text-slate-500">No delivered digital codes yet.</div> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{codes.map((code) => <article key={code.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{code.productName}</h3><p className="mt-1 text-xs text-slate-500">{code.optionName || code.orderNumber}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Delivered</span></div><div className="mt-4 break-all rounded-xl bg-slate-950 p-4 font-mono text-sm font-bold text-cyan-300">{code.code}</div></article>)}</div>}
          </section>

          <section id="notifications" className="mt-10 scroll-mt-40">
            <h2 className="text-2xl font-black">Notifications</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{notifications.length === 0 ? <p className="p-7 text-slate-500">No notifications yet.</p> : notifications.map((notification) => <article key={notification.id} className={`border-b border-slate-200 p-5 last:border-b-0 ${notification.is_read ? "" : "bg-cyan-50/60"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wider text-cyan-600">{notification.notification_type}</p><h3 className="mt-1 font-black">{notification.title}</h3></div><time className="text-xs text-slate-400">{formatDate(notification.created_at)}</time></div><p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p></article>)}</div>
          </section>

          <section id="profile" className="mt-10 scroll-mt-40 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">Profile</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Full name</p><p className="mt-1 font-bold">{displayName}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</p><p className="mt-1 break-all font-bold">{user.email}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone</p><p className="mt-1 font-bold">{String(user.user_metadata?.phone ?? "Not added")}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email status</p><p className="mt-1 font-bold text-emerald-600">Verified</p></div></div>
          </section>
        </div>
      </div>
    </main>
  );
}
