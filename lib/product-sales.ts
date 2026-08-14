import { createAdminClient } from "@/lib/supabase/admin";

type OrderItemSaleRow = {
  product_id: string;
  quantity: number;
  orders:
    | {
        status: string;
      }
    | {
        status: string;
      }[]
    | null;
};

function getOrderStatus(order: OrderItemSaleRow["orders"]) {
  if (Array.isArray(order)) {
    return order[0]?.status;
  }

  return order?.status;
}

export async function getPaidProductSales() {
  const admin = createAdminClient();
  const sales = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const result = await admin
      .from("order_items")
      .select(
        `
          product_id,
          quantity,
          orders!inner (
            status
          )
        `,
      )
      .in("orders.status", ["PAID", "PROCESSING", "DELIVERED"])
      .range(from, from + pageSize - 1);

    if (result.error) {
      throw new Error(
        `Unable to calculate product sales: ${result.error.message}`,
      );
    }

    const rows = (result.data ?? []) as OrderItemSaleRow[];

    for (const row of rows) {
      if (
        getOrderStatus(row.orders) !== "PAID" &&
        getOrderStatus(row.orders) !== "PROCESSING" &&
        getOrderStatus(row.orders) !== "DELIVERED"
      ) {
        continue;
      }

      sales.set(
        row.product_id,
        (sales.get(row.product_id) ?? 0) + Number(row.quantity || 0),
      );
    }

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return sales;
}
