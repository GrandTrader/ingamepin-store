import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import DashboardView, { type DashboardOrder } from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[]; status?: string | string[]; view?: string | string[]; error?: string }>;
}) {
  const { page: pageParam, status: statusParam, view, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email || !user.email_confirmed_at) redirect("/account?error=Please sign in with a verified email.");

  const admin = createAdminClient();
  const orderTabs = [
    { value: "all", label: "All", statuses: [] as string[] },
    { value: "completed", label: "Completed", statuses: ["DELIVERED"] },
    { value: "processing", label: "Processing", statuses: ["PAID", "PROCESSING"] },
    { value: "pending", label: "Pending", statuses: ["PENDING_PAYMENT", "PAYMENT_REVIEW"] },
  ];
  const activeTab = orderTabs.find(tab => tab.value === statusParam) ?? orderTabs[0];
  const requestedPage = typeof pageParam === "string" && /^\d+$/.test(pageParam) ? Number(pageParam) : 1;
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage < 1000000 ? requestedPage : 1;
  const pageSize = 5;
  const email = user.email.toLowerCase();
  let orderQuery = admin.from("orders").select(`
    id, order_number, total, currency, status, created_at, delivered_at,
    order_items(id, product_name, option_name, denomination, platform, quantity)
  `).eq("customer_email", email).eq("sales_channel","RETAIL");
  if (activeTab.statuses.length) orderQuery = orderQuery.in("status", activeTab.statuses);
  const [walletResult, notificationResult, orderResult, codeCountResult, ...countResults] = await Promise.all([
    supabase.from("customer_wallets").select("balance, currency").eq("user_id", user.id).maybeSingle(),
    supabase.from("customer_notifications").select("id, notification_type, title, message, is_read, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    orderQuery.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    admin.from("gift_card_codes")
      .select("id,order_items!inner(orders!inner(customer_email,sales_channel))", { count: "exact", head: true })
      .eq("status", "SOLD").eq("order_items.orders.customer_email", email).eq("order_items.orders.sales_channel","RETAIL"),
    ...orderTabs.map(tab => {
      const query = admin.from("orders").select("id", { count: "exact", head: true }).eq("customer_email", email).eq("sales_channel","RETAIL");
      return tab.statuses.length ? query.in("status", tab.statuses) : query;
    }),
  ]);
  if (orderResult.error || codeCountResult.error || countResults.some(result => result.error)) {
    throw new Error("Unable to load account orders. Please try again.");
  }
  const orderCounts = Object.fromEntries(orderTabs.map((tab, index) => [tab.value, countResults[index].count ?? 0]));
  const pageCount = Math.max(1, Math.ceil(orderCounts[activeTab.value] / pageSize));
  if (currentPage > pageCount) redirect(`/account/dashboard?view=orders&status=${activeTab.value}&page=${pageCount}#orders`);
  const pageOrders = (orderResult.data ?? []) as DashboardOrder[];
  const pageNumbers = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount]))
    .filter(page => page >= 1 && page <= pageCount).sort((a, b) => a - b);

  const wallet = walletResult.data ?? { balance: 0, currency: "USD" };
  const notifications = notificationResult.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const displayName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    user.email.split("@")[0];
  return (
    <DashboardView
      displayName={displayName}
      wallet={wallet}
      deliveredCodes={codeCountResult.count ?? 0}
      unreadCount={unreadCount}
      orders={pageOrders}
      orderTabs={orderTabs}
      orderCounts={orderCounts}
      activeTab={activeTab}
      currentPage={currentPage}
      pageCount={pageCount}
      pageSize={pageSize}
      pageNumbers={pageNumbers}
      isOrdersView={view === "orders"}
      error={error}
    />
  );
}
