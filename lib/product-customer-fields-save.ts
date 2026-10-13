import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;
type CustomerField = {
  id: string | null; label: string; placeholder: string | null;
  field_type: string; is_required: boolean; sort_order: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = ["label", "placeholder", "field_type", "is_required", "sort_order"] as const;

export function readCustomerFields(formData: FormData): CustomerField[] {
  const values = (name: string) => formData.getAll(name).map(value => String(value).trim());
  const ids = values("customer_field_id"), labels = values("customer_field_label");
  const placeholders = values("customer_field_placeholder"), types = values("customer_field_type");
  const required = new Set(values("customer_field_required").map(Number));
  if (labels.length > 20 || [ids, placeholders, types].some(rows => rows.length !== labels.length)
    || [...required].some(index => !Number.isInteger(index) || index < 0 || index >= labels.length)) {
    throw new Error("Customer information fields are invalid.");
  }
  return labels.map((label, index) => {
    if (!label || label.length > 80 || placeholders[index].length > 150
      || !["TEXT", "EMAIL", "NUMBER", "TEXTAREA"].includes(types[index])
      || (ids[index] && !uuid.test(ids[index]))) throw new Error("Customer information fields are invalid.");
    return { id: ids[index] || null, label, placeholder: placeholders[index] || null,
      field_type: types[index], is_required: required.has(index), sort_order: index };
  });
}

// Validate the entire edit before other product changes. Existing field IDs are
// delivery identifiers and must survive ordinary label/placeholder edits.
export async function prepareCustomerFieldsSave(db: DB, productId: string, fields: CustomerField[]) {
  const [existing, imported, product] = await Promise.all([
    db.from("product_customer_fields").select("id,label,placeholder,field_type,is_required,sort_order").eq("product_id", productId),
    db.from("fkwallet_imports").select("customer_fields").eq("product_id", productId).maybeSingle(),
    db.from("products").select("stock_source").eq("id", productId).single(),
  ]);
  if (existing.error || imported.error || product.error) throw new Error("Customer fields could not be checked. Refresh and try again.");
  const saved = (existing.data ?? []) as CustomerField[];
  const ids = fields.flatMap(field => field.id ? [field.id] : []);
  if (new Set(ids).size !== ids.length || ids.some(id => !saved.some(field => field.id === id))) {
    throw new Error("The customer fields changed. Refresh the product before saving.");
  }
  if (imported.data) {
    const mappings = imported.data.customer_fields as { fieldId: string; fieldType: string }[];
    if (!Array.isArray(mappings) || fields.length !== mappings.length || mappings.some(mapping =>
      !fields.some(field => field.id === mapping.fieldId && field.field_type === mapping.fieldType && field.is_required))) {
      throw new Error("Keep the imported FKWallet customer fields and their required field types. Their delivery links must stay unchanged.");
    }
  }
  const updates = fields.filter(field => field.id && columns.some(key =>
    field[key] !== saved.find(row => row.id === field.id)?.[key]));
  const additions = fields.filter(field => !field.id);
  const removals = saved.flatMap(field => field.id && !ids.includes(field.id) ? [field.id] : []);
  if (product.data.stock_source === "FKWALLET" && (updates.length || additions.length || removals.length)) {
    throw new Error("Disable FKWallet automatic delivery in Supplier before editing customer fields.");
  }
  return async () => {
    for (const field of updates) {
      const { id, ...changes } = field;
      const result = await db.from("product_customer_fields").update(changes).eq("product_id", productId).eq("id", id!).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("Customer fields could not be saved. Refresh and try again.");
    }
    if (additions.length) {
      const result = await db.from("product_customer_fields").insert(additions.map(field => ({
        product_id: productId, label: field.label, placeholder: field.placeholder,
        field_type: field.field_type, is_required: field.is_required, sort_order: field.sort_order,
      })));
      if (result.error) throw new Error("New customer fields could not be saved. Refresh and try again.");
    }
    if (removals.length) {
      const result = await db.from("product_customer_fields").delete().eq("product_id", productId).in("id", removals);
      if (result.error) throw new Error("Customer fields could not be removed. Refresh and try again.");
    }
  };
}
