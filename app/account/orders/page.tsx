import { redirect } from "next/navigation";
import { getCustomerOrders } from "@/lib/customer-account-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CustomerOrdersPageProps = {
  searchParams: Promise<{ error?: string; orderId?: string; orderNumber?: string; page?: string; status?: string }>;
};

export default async function CustomerOrdersPage({ searchParams }: CustomerOrdersPageProps) {
  const { error, orderId, orderNumber, page, status } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    if (orderId) redirect(orderNumber ? `/track-order?orderNumber=${encodeURIComponent(orderNumber)}` : "/track-order");
    redirect("/account?error=Please sign in to continue.");
  }
  if (orderId) {
    const orders = await getCustomerOrders(user.email);
    if (orders.some(order => order.id === orderId)) redirect(`/account/orders/${encodeURIComponent(orderId)}`);
  }
  const query = new URLSearchParams({ view: "orders" });
  if (typeof page === "string") query.set("page", page);
  if (typeof status === "string") query.set("status", status);
  if (typeof error === "string") query.set("error", error);
  redirect(`/account/dashboard?${query.toString()}#orders`);
}
