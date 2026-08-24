import { createAdminClient } from "@/lib/supabase/admin";

export type DeliveredCodeRow = {
  id: string;
  order_item_id: string | null;
  product_option_id: string | null;
  code: string;
  sold_at: string | null;
};

const PAGE_SIZE = 1000;

export async function getAllDeliveredCodes(
  orderItemIds: string[],
): Promise<DeliveredCodeRow[]> {
  if (orderItemIds.length === 0) return [];

  const admin = createAdminClient();
  const rows: DeliveredCodeRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await admin
      .from("gift_card_codes")
      .select("id, order_item_id, product_option_id, code, sold_at")
      .in("order_item_id", orderItemIds)
      .eq("status", "SOLD")
      .order("sold_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (result.error) {
      throw new Error(`Unable to load delivered codes: ${result.error.message}`);
    }

    const page = (result.data ?? []) as DeliveredCodeRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}
