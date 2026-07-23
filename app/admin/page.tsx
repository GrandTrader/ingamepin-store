import Link from "next/link";
import { redirect } from "next/navigation";

import {
  adminLogout,
  sendTestEmail,
} from "./actions";
import AdminSidebar from "./AdminSidebar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AdminDashboardProps = {
  searchParams: Promise<{
    emailSuccess?: string;
    emailError?: string;
  }>;
};

type RecentOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
};

function formatMoney(
  amount: number | string,
  currency = "INR",
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function statusClass(status: string) {
  switch (status) {
    case "DELIVERED":
      return "bg-emerald-100 text-emerald-700";

    case "PAID":
    case "PROCESSING":
      return "bg-blue-100 text-blue-700";

    case "PAYMENT_REVIEW":
      return "bg-amber-100 text-amber-700";

    case "CANCELLED":
    case "REFUNDED":
      return "bg-red-100 text-red-700";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default async function AdminDashboard({
  searchParams,
}: AdminDashboardProps) {
  const { emailSuccess, emailError } =
    await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  const today = new Date();

  today.setUTCHours(0, 0, 0, 0);

  const [
    productsResult,
    ordersResult,
    paymentsResult,
    codesResult,
    recentOrdersResult,
    revenueResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*", {
        count: "exact",
        head: true,
      }),

    supabase
      .from("orders")
      .select("*", {
        count: "exact",
        head: true,
      }),

    supabase
      .from("payments")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("status", "SUBMITTED"),

    supabase
      .from("gift_card_codes")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("status", "AVAILABLE"),

    supabase
      .from("orders")
      .select(
        `
          id,
          order_number,
          customer_name,
          total,
          currency,
          status,
          created_at
        `,
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(5),

    supabase
      .from("orders")
      .select("total")
      .gte(
        "created_at",
        today.toISOString(),
      )
      .in("status", [
        "PAID",
        "PROCESSING",
        "DELIVERED",
      ]),
  ]);

  const recentOrders =
    (recentOrdersResult.data ??
      []) as RecentOrder[];

  const revenueToday = (
    revenueResult.data ?? []
  ).reduce(
    (total, order) =>
      total + Number(order.total ?? 0),
    0,
  );

  const cards = [
    {
      label: "Revenue today",
      value: formatMoney(revenueToday),
      description: "Verified sales today",
      href: "/admin/orders",
    },
    {
      label: "Orders",
      value: ordersResult.count ?? 0,
      description: "All customer orders",
      href: "/admin/orders",
    },
    {
      label: "Needs review",
      value: paymentsResult.count ?? 0,
      description: "Payment proofs",
      href: "/admin/payments",
    },
    {
      label: "Available codes",
      value: codesResult.count ?? 0,
      description: "Ready for delivery",
      href: "/admin/gift-codes",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar
          orderCount={
            paymentsResult.count ?? 0
          }
        />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-black">
                Store overview
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Today&apos;s activity and items
                needing attention
              </p>
            </div>

            <form action={adminLogout}>
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              >
                Sign out
              </button>
            </form>
          </header>

          {emailSuccess && (
            <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {emailSuccess}
            </p>
          )}

          {emailError && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              Email test failed: {emailError}
            </p>
          )}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-2xl bg-slate-100 p-5 transition hover:-translate-y-1 hover:bg-blue-50 hover:shadow-md"
              >
                <p className="text-sm text-slate-500">
                  {card.label}
                </p>

                <p className="mt-2 text-3xl font-black">
                  {card.value}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {card.description}
                </p>
              </Link>
            ))}
          </section>

          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black">
                  Recent orders
                </h2>

                <Link
                  href="/admin/orders"
                  className="text-sm font-bold text-blue-600 hover:text-blue-500"
                >
                  View all
                </Link>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left">
                    <thead className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                      <tr>
                        <th className="px-5 py-4">
                          Order
                        </th>

                        <th className="px-5 py-4">
                          Customer
                        </th>

                        <th className="px-5 py-4">
                          Amount
                        </th>

                        <th className="px-5 py-4">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {recentOrders.map(
                        (order) => (
                          <tr key={order.id}>
                            <td className="px-5 py-4 font-bold">
                              {order.order_number}
                            </td>

                            <td className="px-5 py-4">
                              {order.customer_name ||
                                "Customer"}
                            </td>

                            <td className="px-5 py-4 font-bold">
                              {formatMoney(
                                order.total,
                                order.currency,
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                                  order.status,
                                )}`}
                              >
                                {order.status ===
                                "DELIVERED"
                                  ? "COMPLETED"
                                  : order.status.replaceAll(
                                      "_",
                                      " ",
                                    )}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}

                      {recentOrders.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-5 py-10 text-center text-slate-500"
                          >
                            No orders available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <aside>
              <h2 className="text-xl font-black">
                Quick actions
              </h2>

              <div className="mt-4 grid gap-3">
                <form
                  action={sendTestEmail}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <label
                    htmlFor="testEmailRecipient"
                    className="text-sm font-black"
                  >
                    Test customer email
                  </label>

                  <input
                    id="testEmailRecipient"
                    name="recipient"
                    type="email"
                    required
                    placeholder="your-email@example.com"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white transition hover:bg-blue-500"
                  >
                    Send test email
                  </button>
                </form>

                <Link
                  href="/admin/products"
                  className="rounded-xl border border-slate-200 px-4 py-3 font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                >
                  ＋ Add product
                </Link>

                <Link
                  href="/admin/payments"
                  className="rounded-xl border border-slate-200 px-4 py-3 font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                >
                  ✓ Verify payments
                </Link>

                <Link
                  href="/admin/gift-codes"
                  className="rounded-xl border border-slate-200 px-4 py-3 font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                >
                  ⌘ Add gift codes
                </Link>

                <Link
                  href="/admin/orders"
                  className="rounded-xl border border-slate-200 px-4 py-3 font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                >
                  ▣ Manage orders
                </Link>
              </div>
            </aside>
          </div>

          <footer className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">
            Signed in as {user.email} ·{" "}
            {adminResult.data.role}
          </footer>
        </main>
      </div>
    </div>
  );
}
