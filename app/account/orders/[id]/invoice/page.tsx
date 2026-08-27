import { notFound, redirect } from "next/navigation";
import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

import CustomerInvoiceBuilder from "./CustomerInvoiceBuilder";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

countries.registerLocale(englishCountries);

type CustomerInvoicePageProps = {
  params: Promise<{ id: string }>;
};

type OrderItem = {
  id: string;
  product_name: string;
  option_name: string | null;
  denomination: number | string | null;
  platform: string | null;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
};

export default async function CustomerInvoicePage({
  params,
}: CustomerInvoicePageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/account?error=Please sign in to continue.");
  }

  const admin = createAdminClient();
  const [orderResult, paymentResult] = await Promise.all([
    admin
      .from("orders")
      .select(
        `
          id,
          order_number,
          customer_name,
          customer_email,
          currency,
          subtotal,
          discount,
          total,
          status,
          created_at,
          paid_at,
          order_items (
            id,
            product_name,
            option_name,
            denomination,
            platform,
            quantity,
            unit_price,
            total_price
          )
        `,
      )
      .eq("id", id)
      .eq("customer_email", user.email.toLowerCase())
      .maybeSingle(),
    admin
      .from("payments")
      .select(
        "method, status, transaction_id, gateway_payment_id, verified_at, created_at",
      )
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (orderResult.error || !orderResult.data) {
    notFound();
  }

  const order = orderResult.data;

  const displayName =
    String(user.user_metadata?.full_name ?? "").trim() ||
    order.customer_name ||
    user.email.split("@")[0];
  const countryNames = Object.values(
    countries.getNames("en", { select: "official" }),
  ).sort((first, second) => first.localeCompare(second, "en"));
  const payment = paymentResult.data;

  return (
    <CustomerInvoiceBuilder
      order={{
        id: order.id,
        orderNumber: order.order_number,
        customerEmail: order.customer_email,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: Number(order.total),
        status: order.status,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        items: (order.order_items ?? []).map((item: OrderItem) => ({
          id: item.id,
          productName: item.product_name,
          optionName:
            item.option_name ||
            (item.denomination !== null
              ? String(item.denomination)
              : "Standard option"),
          platform: item.platform,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price),
        })),
      }}
      payment={{
        method: payment?.method ?? "Recorded payment",
        status: payment?.status ?? "PENDING",
        transactionId:
          payment?.transaction_id || payment?.gateway_payment_id || "",
        verifiedAt: payment?.verified_at ?? order.paid_at,
      }}
      countryNames={countryNames}
      defaultCustomerName={displayName}
    />
  );
}
