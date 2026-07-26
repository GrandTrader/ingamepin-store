import { createAdminClient } from "@/lib/supabase/admin";

import EditProductOptionsFields, {
  type EditableProductOption,
} from "./EditProductOptionsFields";
import type { ProductDeliveryType } from "../../DeliveryTypeSwitch";

type ProductOptionsInventorySectionProps = {
  productId: string;
  initialOptions: EditableProductOption[];
  initialDeliveryType: ProductDeliveryType;
};

export type EditableProductCode = {
  id: string;
  code: string;
  productOptionId: string | null;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "DISABLED";
  note: string | null;
};

export default async function ProductOptionsInventorySection({
  productId,
  initialOptions,
  initialDeliveryType,
}: ProductOptionsInventorySectionProps) {
  const admin = createAdminClient();
  const codeResult = await admin
    .from("gift_card_codes")
    .select("id, code, product_option_id, status, note")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (codeResult.error) {
    throw new Error(
      `Unable to load voucher codes: ${codeResult.error.message}`,
    );
  }

  const initialCodes: EditableProductCode[] = (codeResult.data ?? []).map(
    (code) => ({
      id: code.id,
      code: code.code,
      productOptionId: code.product_option_id,
      status: code.status,
      note: code.note,
    }),
  );

  return (
    <EditProductOptionsFields
      productId={productId}
      initialOptions={initialOptions}
      initialDeliveryType={initialDeliveryType}
      initialCodes={initialCodes}
    />
  );
}
