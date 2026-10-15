"use client";

import { toggleProductSales } from "./actions";
import ProductListSwitch from "./ProductListSwitch";

export default function ProductSalesSwitch({ id, name, active }: {
  id: string;
  name: string;
  active: boolean;
}) {
  async function save(enabled: boolean) {
    const form = new FormData();
    form.set("product_id", id);
    form.set("current_status", enabled ? "INACTIVE" : "ACTIVE");
    return toggleProductSales(form);
  }

  return <ProductListSwitch enabled={active} label={"Sales for " + name} offColor="bg-red-500" save={save} />;
}
