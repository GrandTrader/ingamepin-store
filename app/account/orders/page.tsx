import Link from "next/link";
import { redirect } from "next/navigation";

import CustomerAccountShell from "../CustomerAccountShell";
import {
  customerDisplayName,
  customerStatusClass,
  formatCustomerDate,
  formatCustomerMoney,
  getCustomerOrders,
} from "@/lib/customer-account-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CustomerOrdersPageProps = {
  searchParams: Promise<{
    error?: string;
    orderId?: string;
    orderNumber?: string;
  }>;
};

export default async function CustomerOrdersPage({
  searchParams,
}: CustomerOrdersPageProps) {
  const { error, orderId, orderNumber } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    if (orderId) {
      const trackingUrl = orderNumber
        ? `/track-order?orderNumber=${encodeURIComponent(orderNumber)}`
        : "/track-order";

      redirect(trackingUrl);
    }

    redirect("/account?error=Please sign in to continue.");
  }

  const displayName = customerDisplayName(user);
  const orders = await getCustomerOrders(user.email);

  if (orderId && orders.some((order) => order.id === orderId)) {
    redirect(`/account/orders/${encodeURIComponent(orderId)}`);
  }

  return (
    <CustomerAccountShell displayName={displayName}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
            Customer account
          </p>
          <h1 className="mt-2 text-3xl font-black">My Orders</h1>
          <p className="mt-2 text-slate-500">View and track every purchase.</p>
        </div>
        <Link href="/track-order" className="text-sm font-bold text-cyan-600">
          Track an order
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-white p-7 text-center text-slate-500">
          No orders found.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Products</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((order) => {
                  return (
                    <tr key={order.id}>
                      <td className="px-5 py-5 font-bold">
                        <Link
                          href={`/account/orders/${order.id}`}
                          className="text-cyan-700 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-600"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="px-5 py-5">
                        {order.order_items.map((item) => (
                          <p key={item.id}>
                            {item.product_name}
                            {item.option_name ? ` - ${item.option_name}` : ""}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                          </p>
                        ))}
                      </td>
                      <td className="px-5 py-5 font-bold">
                        {formatCustomerMoney(order.total, order.currency)}
                      </td>
                      <td className="px-5 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${customerStatusClass(
                            order.status,
                          )}`}
                        >
                          {order.status === "DELIVERED"
                            ? "COMPLETED"
                            : order.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-slate-500">
                        {formatCustomerDate(order.created_at)}
                      </td>
                      <td className="px-5 py-5 text-right">
                        {order.status === "DELIVERED" ? (
                          <Link
                            href={`/account/orders/${order.id}/invoice`}
                            className="inline-flex rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-100"
                          >
                            Full Order Invoice
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CustomerAccountShell>
  );
}
