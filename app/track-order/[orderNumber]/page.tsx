import { notFound } from "next/navigation";
import OrderDetails from "./OrderDetails";
import { purchasePage, validOrderReference } from "@/lib/purchase-navigation";

export const metadata = { title: "Order details", robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ page?: string }> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  const orderNumber = validOrderReference(route.orderNumber);
  if (!orderNumber) notFound();
  return <OrderDetails key={orderNumber} orderNumber={orderNumber} returnPage={purchasePage(query.page)} />;
}
