import "server-only";
import { getDigiSellerToken, postDigiSeller } from "./digiseller-api";
import type { createAdminClient } from "./supabase/admin";
import type { DigiFieldLink } from "./digiseller-customer-information";
type DB = ReturnType<typeof createAdminClient>;
type Field = { id: string; label: string; placeholder: string | null; field_type: string; is_required: boolean };
type Parameter = { id: number; type: string; name: { locale: string; value: string }[]; required?: boolean };

export async function getDigiSellerRecipientFields(db: DB, productId: string): Promise<Field[] | null> {
  const [imp, fields] = await Promise.all([
    db.from("fkwallet_imports").select("customer_fields").eq("product_id", productId).maybeSingle(),
    db.from("product_customer_fields").select("id,label,placeholder,field_type,is_required").eq("product_id", productId).order("sort_order"),
  ]);
  if (imp.error || fields.error) throw new Error("Customer information could not be checked.");
  if (!imp.data) {
    if (fields.data?.length) throw new Error("Automatic DigiSeller recipient delivery is supported for imported FKWallet products. Set up a supported supplier first.");
    return null;
  }
  const mappings = imp.data.customer_fields as { fieldId: string; fieldType: string }[];
  if (!Array.isArray(mappings) || mappings.length !== fields.data?.length || mappings.some(m =>
    !fields.data?.some(f => f.id === m.fieldId && f.field_type === m.fieldType && f.is_required))) {
    throw new Error("Restore the FKWallet customer field links before syncing DigiSeller.");
  }
  // Readiness check happens before creating or editing external parameters.
  const check = await db.from("digiseller_fkwallet_products").select("digiseller_product_id").eq("product_id", productId);
  if (check.error) throw new Error("Install the DigiSeller customer delivery database update first.");
  return fields.data as Field[];
}

async function parameterList(productId: number, token: string): Promise<Parameter[]> {
  const response = await fetch(`https://api.digiseller.com/api/products/options/list/${productId}?token=${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result?.retval !== 0 || !Array.isArray(result.content)) throw new Error("DigiSeller customer fields could not be loaded.");
  return result.content;
}

async function verifyParameter(optionId: number, type: string, token: string) {
  const response = await fetch(`https://api.digiseller.com/api/products/options/${optionId}?token=${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result?.retval !== 0 || Number(result.content?.id) !== optionId
    || result.content?.type !== type || result.content?.required !== true) {
    throw new Error("DigiSeller has not confirmed the required customer field. Sync again before accepting orders.");
  }
}

export async function syncDigiSellerRecipientFields(db: DB, productId: string) {
  const fields = await getDigiSellerRecipientFields(db, productId);
  if (fields === null) return 0;
  const options = await db.from("product_options").select("digiseller_product_id").eq("product_id", productId).eq("is_active", true).not("digiseller_product_id", "is", null);
  if (options.error) throw new Error("DigiSeller product matches could not be loaded.");
  const ids = [...new Set((options.data ?? []).map(row => Number(row.digiseller_product_id)))];
  if (!ids.length) throw new Error("Connect a DigiSeller product first.");
  const { token } = await getDigiSellerToken();
  for (const digiId of ids) {
    const saved = await db.from("digiseller_fkwallet_products").select("field_map").eq("digiseller_product_id", digiId).maybeSingle();
    if (saved.error) throw new Error("Customer field links could not be loaded.");
    const started = await db.rpc("configure_digiseller_fkwallet", { p_product_id: productId, p_digiseller_id: digiId, p_fields: [], p_ready: false });
    if (started.error) throw new Error("DigiSeller product is already connected elsewhere or the database update is missing.");
    const parameters = await parameterList(digiId, token);
    const links: DigiFieldLink[] = [];
    for (const [index, field] of fields.entries()) {
      const type = field.field_type === "TEXTAREA" ? "textarea" : "text";
      const previous = (saved.data?.field_map as DigiFieldLink[] | undefined)?.find(link => link.fieldId === field.id);
      const matches = parameters.filter(p => p.name?.some(name => name.value.trim().toLowerCase() === field.label.trim().toLowerCase()));
      let optionId = previous && parameters.some(p => Number(p.id) === previous.optionId && p.type === type) ? previous.optionId : null;
      if (!optionId && matches.length) {
        if (matches.length !== 1 || matches[0].type !== type) throw new Error(`The DigiSeller field “${field.label}” is ambiguous. Review it before syncing.`);
        optionId = Number(matches[0].id);
      }
      const payload = { name: [{ locale: "en-US", value: field.label }, { locale: "ru-RU", value: field.label }],
        comment: field.placeholder ? [{ locale: "en-US", value: field.placeholder }, { locale: "ru-RU", value: field.placeholder }] : null,
        type, required: true, separate_content: false, modifier_visible: false, order: index + 2 };
      if (optionId) {
        await postDigiSeller("/api/products/options/update", { ...payload, option_id: optionId }, token);
      } else {
        const created = await postDigiSeller("/api/products/options", { ...payload, product_id: digiId }, token);
        optionId = Number((created.content as { option_id?: number })?.option_id);
      }
      if (!Number.isSafeInteger(optionId) || optionId! <= 0 || links.some(link => link.optionId === optionId)) throw new Error("DigiSeller did not return a unique customer field. Refresh and sync again.");
      await verifyParameter(optionId!, type, token);
      links.push({ fieldId: field.id, fieldType: field.field_type, optionId: optionId! });
    }
    const finished = await db.rpc("configure_digiseller_fkwallet", { p_product_id: productId, p_digiseller_id: digiId, p_fields: links, p_ready: true });
    if (finished.error) throw new Error("Customer fields were created but their delivery links could not be saved. Sync again.");
  }
  return ids.length;
}
