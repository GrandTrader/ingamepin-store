import { notFound, redirect } from "next/navigation";
import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

import CustomerInvoiceBuilder from "./CustomerInvoiceBuilder";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";

export const dynamic = "force-dynamic";

countries.registerLocale(englishCountries);

type CustomerInvoicePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ itemId?: string }>;
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
  searchParams,
}: CustomerInvoicePageProps) {
  const [{ id }, { itemId }] = await Promise.all([params, searchParams]);
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
  const allItems = (order.order_items ?? []) as OrderItem[];
  const selectedItemIndex = itemId
    ? allItems.findIndex((item) => item.id === itemId)
    : -1;

  if (itemId && selectedItemIndex < 0) {
    notFound();
  }

  const deliveredCodes = await getAllDeliveredCodes(
    allItems.map((item) => item.id),
  );
  const deliveredCountByItem = new Map<string, number>();
  for (const code of deliveredCodes) {
    if (!code.order_item_id) continue;
    deliveredCountByItem.set(
      code.order_item_id,
      (deliveredCountByItem.get(code.order_item_id) ?? 0) + 1,
    );
  }
  const itemIsDelivered = (item: OrderItem) =>
    (deliveredCountByItem.get(item.id) ?? 0) >= item.quantity;

  if (
    (selectedItemIndex >= 0 && !itemIsDelivered(allItems[selectedItemIndex])) ||
    (selectedItemIndex < 0 && !allItems.every(itemIsDelivered))
  ) {
    notFound();
  }

  const invoiceItems = selectedItemIndex >= 0
    ? [allItems[selectedItemIndex]]
    : allItems;
  const invoiceSubtotal = invoiceItems.reduce(
    (sum, item) => sum + Number(item.total_price),
    0,
  );
  const orderSubtotal = Number(order.subtotal);
  const invoiceDiscount = selectedItemIndex >= 0 && orderSubtotal > 0
    ? Number(order.discount) * (invoiceSubtotal / orderSubtotal)
    : Number(order.discount);
  const invoiceTotal = Math.max(invoiceSubtotal - invoiceDiscount, 0);

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
        invoiceNumber: selectedItemIndex >= 0
          ? `${order.order_number}-${String(selectedItemIndex + 1).padStart(2, "0")}`
          : order.order_number,
        customerEmail: order.customer_email,
        currency: order.currency,
        subtotal: invoiceSubtotal,
        discount: invoiceDiscount,
        total: invoiceTotal,
        status: order.status,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        items: invoiceItems.map((item: OrderItem) => ({
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
      defaultBilling={{
        fullName: String(user.user_metadata?.billing_full_name ?? displayName),
        companyName: String(user.user_metadata?.billing_company_name ?? ""),
        country: String(user.user_metadata?.billing_country ?? ""),
        addressLine1: String(user.user_metadata?.billing_address_line_1 ?? user.user_metadata?.billing_address ?? ""),
        addressLine2: String(user.user_metadata?.billing_address_line_2 ?? ""),
        city: String(user.user_metadata?.billing_city ?? ""),
        state: String(user.user_metadata?.billing_state ?? ""),
        postalCode: String(user.user_metadata?.billing_postal_code ?? ""),
        taxpayerId: String(user.user_metadata?.billing_taxpayer_id ?? ""),
      }}
    />
  );
}
