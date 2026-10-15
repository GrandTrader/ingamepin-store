import { createAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";
import { mergeImportedProductSales, productStatisticsImports, statisticsProductIds } from "./product-statistics-imports";

async function importedExternalSales(productId?: string) {
  const ids = [...new Set(productStatisticsImports
    .filter(link => !productId || link.targetId === productId).map(link => link.sourceId))];
  if (!ids.length) return new Map<string, number>();
  const result = await createAdminClient().from("products").select("id,sold_count").in("id", ids);
  if (result.error) throw new Error("Unable to load imported product sales: " + result.error.message);
  return new Map<string, number>((result.data ?? []).map(row => [row.id, Number(row.sold_count ?? 0)]));
}

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

const getCachedPaidProductSales = unstable_cache(async () => {
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
      .order("id")
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

  return Array.from(mergeImportedProductSales(sales, await importedExternalSales()).entries());
}, ["paid-product-sales-v2", JSON.stringify(productStatisticsImports)], {
  revalidate: 30,
  tags: ["paid-product-sales"],
});

export async function getPaidProductSales() {
  return new Map(await getCachedPaidProductSales());
}

// The editor needs one product's total, not the entire catalogue's order history.
export const getPaidProductSalesForProduct = unstable_cache(async (productId: string) => {
  const admin = createAdminClient();
  const pageSize = 1000;
  let total = 0;
  for (let from = 0; ; from += pageSize) {
    const result = await admin.from("order_items")
      .select("product_id, quantity, orders!inner(status)")
      .in("product_id", statisticsProductIds(productId))
      .in("orders.status", ["PAID", "PROCESSING", "DELIVERED"])
      .order("id")
      .range(from, from + pageSize - 1);
    if (result.error) {
      throw new Error(`Unable to calculate product sales: ${result.error.message}`);
    }
    const rows = (result.data ?? []) as OrderItemSaleRow[];
    for (const row of rows) {
      if (["PAID", "PROCESSING", "DELIVERED"].includes(getOrderStatus(row.orders) ?? "")) {
        total += Number(row.quantity || 0);
      }
    }
    if (rows.length < pageSize) {
      const imported = await importedExternalSales(productId);
      return total + [...imported.values()].reduce((sum, count) => sum + count, 0);
    }
  }
}, ["paid-product-sales-by-product-v2", JSON.stringify(productStatisticsImports)], {
  revalidate: 30,
  tags: ["paid-product-sales"],
});
