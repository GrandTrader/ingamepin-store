import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefinitePlayCatalogue, getDefinitePlayItems, getDefinitePlayStatus } from "./definiteplay-relay";
import { prepareSupplierDraft, supplierDefaultDenomination } from "./definiteplay-import";
import type { WupexCredentials, WupexProduct } from "./wupex-types";
import { requireWupexCredentials } from "./wupex-storage";
import { getWupexCatalog, findWupexProducts, getWupexBalance, getWupexFields, wupexConnectionId } from "./wupex-api";
import { getCachedWupexCatalogFilters } from "./wupex-catalog-filters";
import { prepareWupexDraft } from "./wupex-import";
import { assertWupexLive, wupexDeliveryEnabled } from "./wupex-fulfillment";
import { requireCredentials } from "./fkwallet-storage";
import { connectionId, fkRequest, parseCategories, parseProducts } from "./fkwallet-api";
import { prepareFKDraft, fkImportIssue } from "./fkwallet-import";
import { isSupplier, validateSupplierSelection, type SupplierProvider, type SupplierSelection, type SupplierChoice } from "./supplier-switch";

type DB = ReturnType<typeof createAdminClient>;
/** Load complete category and region choices independently of the current search and page. */
export async function supplierCatalogFilters(provider: SupplierProvider): Promise<{ categories: { id: string; name: string }[]; regions: string[] }> {
  if (!isSupplier(provider)) throw new Error("Choose a valid supplier.");
  if (provider === "WUPEX") {
    const filters = await getCachedWupexCatalogFilters(await requireWupexCredentials());
    return { categories: filters.categories.map(name => ({ id: name, name })), regions: filters.regions };
  }
  if (provider === "DEFINITEPLAY") {
    const result = await getDefinitePlayCatalogue("", 0, 1);
    if (result.stale) throw new Error("Definite Play catalogue is stale. Refresh its connection before switching.");
    return { categories: result.categories.map(name => ({ id: name, name })), regions: result.regions };
  }
  return { categories: parseCategories(await fkRequest(await requireCredentials(), "op/categories"))
    .map(category => ({ id: String(category.id), name: category.name })), regions: [] };
}

export async function supplierCatalogue(provider: SupplierProvider, query: string, category: string, region: string, page: number) {
  if (!isSupplier(provider) || typeof query !== "string" || query.length > 150 || typeof category !== "string" || category.length > 200 || typeof region !== "string" || region.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("Choose a valid supplier search.");
  let items: SupplierChoice[] = [], total = 0;
  let categories: { id: string; name: string }[] = [];
  if (provider === "DEFINITEPLAY") {
    const result = await getDefinitePlayCatalogue(query, (page - 1) * 20, 20, { category, region });
    if (result.stale) throw new Error("Definite Play catalogue is stale. Refresh its connection before switching.");
    items = result.items.filter(p => p.currency === "USD" && Number(p.price) > 0).map(p => ({ key: p.sku, name: p.name.slice(0,150), cost: p.price, costCurrency: p.currency, region: p.region, denomination: supplierDefaultDenomination(p), currency: p.cardCurrency || "USD", kind: "CODE" }));
    total = result.total; categories = result.categories.map(id => ({ id, name: id }));
  } else if (provider === "WUPEX") {
    const result = await getWupexCatalog(await requireWupexCredentials(), page, query, "", 20, { category, region });
    items = result.products.filter(p => p.price > 0).map(p => ({ key: String(p.id), name: p.name.slice(0,150), cost: String(p.price), costCurrency: "USD", region: p.region, denomination: String(p.faceValue || 1), currency: "USD", kind: p.cardType === "voucher" ? "CODE" : "ACCOUNT" }));
    total = result.totalCount;
  } else {
    const credentials = await requireCredentials();
    categories = parseCategories(await fkRequest(credentials, "op/categories")).map(c => ({ id: String(c.id), name: c.name }));
    if (category) {
      if (!categories.some(c => c.id === category)) throw new Error("Select an FKWallet category.");
      const products = parseProducts(await fkRequest(credentials, `op/categories/${category}/products`)).filter(p => !fkImportIssue(p) && p.name.toLowerCase().includes(query.toLowerCase()));
      total = products.length;
      items = products.slice((page - 1) * 20, page * 20).map(p => ({ key: String(p.id), name: p.name.slice(0,150), cost: String(p.price), costCurrency: p.currency, region: "", denomination: "1", currency: "USD", kind: p.fields.length ? "ACCOUNT" : "CODE" }));
    }
  }
  return { items, total, categories };
}

export async function prepareSupplierConfiguration(db: DB, productId: string, input: SupplierSelection) {
  validateSupplierSelection(input);
  const product = await db.from("products").select("id,name,name_ru,description,description_ru,region,category_id,seller_id").eq("id",productId).single();
  if (product.error || product.data.seller_id) throw new Error("Choose a store-owned product.");
  const p = product.data;
  const metadata = { requestId: productId, categoryId: p.category_id, title: p.name, titleRu: p.name_ru || "", description: (p.description || "").slice(0,5000), descriptionRu: (p.description_ru || "").slice(0,5000), region: p.region || "Global", markup: input.markup, exchangeRate: input.exchangeRate };
  if (input.provider === "DEFINITEPLAY") {
    if (input.deliveryKind !== "CODE" || input.exchangeRate !== "1") throw new Error("Definite Play uses code delivery with USD costs.");
    const [catalogue, status] = await Promise.all([getDefinitePlayItems(input.options.map(o => o.key)), getDefinitePlayStatus()]);
    if (catalogue.stale || status.stale || !status.fulfillmentReady || process.env.DEFINITEPLAY_FULFILLMENT_ENABLED?.trim() !== "true") throw new Error("Definite Play delivery must be connected and up to date first.");
    const options = input.options.map(o => ({ sku: o.key, expectedCost: catalogue.items.find(p => p.sku === o.key)?.price || "0", denomination: o.denomination, currency: o.currency }));
    const draft = prepareSupplierDraft({ ...metadata, options }, catalogue.items);
    return { connection: "", draft: { markup: input.markup, exchangeRate: "1", customerFields: [], kind: "CODE", options: draft.options.map(o => ({ ...o, optionId: input.options.find(r => r.key === o.sku)!.optionId, name: input.options.find(r => r.key === o.sku)!.name, supplierKey: o.sku, supplierCost: options.find(r => r.sku === o.sku)!.expectedCost, supplierCurrency: "USD", price: Number(o.price).toFixed(2) })) } };
  }
  if (input.provider === "WUPEX") {
    const credentials = await requireWupexCredentials(); assertWupexLive(credentials);
    if (!wupexDeliveryEnabled()) throw new Error("Enable the Wupex delivery worker first.");
    const [products, balance] = await Promise.all([findSelectedWupexProducts(db, credentials, productId, input), getWupexBalance(credentials)]);
    if (products.length !== input.options.length) throw new Error("A denomination is no longer in the Wupex catalogue. Reload the selection.");
    if (new Set(products.map(p => p.region.trim().toLowerCase())).size !== 1 || new Set(products.map(p => p.category)).size !== 1) throw new Error("Choose denominations from the same supplier category and region.");
    const enriched = [];
    for (let offset=0; offset<products.length; offset+=4) enriched.push(...await Promise.all(products.slice(offset,offset+4).map(async p => ({ ...p, fields: await getWupexFields(credentials,p) }))));
    const kind = products[0].cardType === "voucher" ? "CODE" : "ACCOUNT";
    if (input.deliveryKind !== kind) throw new Error("The selected delivery type does not match Wupex.");
    const connection = wupexConnectionId(credentials);
    const draft = prepareWupexDraft({ ...metadata, connectionId: connection, query: input.query, options: input.options.map(o => ({ id: Number(o.key), expectedCost: String(products.find(p=>p.id===Number(o.key))!.price), expectedCurrency: "USD", name:o.name, denomination:o.denomination, currency:o.currency, optionType:"CURRENCY" })) }, enriched, balance.currency);
    return { connection, draft: { ...draft, kind, options: draft.options.map(o=>({...o,optionId:input.options.find(r=>Number(r.key)===o.supplierId)!.optionId,supplierKey:String(o.supplierId),supplierSnapshot:{...o.supplierSnapshot,available:undefined}})) } };
  }
  const credentials = await requireCredentials(), connection = connectionId(credentials);
  if (process.env.FKWALLET_FULFILLMENT_ENABLED?.trim() !== "true") throw new Error("Enable the FKWallet delivery worker first.");
  if (!/^[1-9]\d{0,12}$/.test(input.category)) throw new Error("Choose an FKWallet category.");
  const products = parseProducts(await fkRequest(credentials, `op/categories/${input.category}/products`));
  const draft = prepareFKDraft({ ...metadata, connectionId:connection, supplierCategoryId:Number(input.category), options:input.options.map(o=>({id:Number(o.key),expectedCost:String(products.find(p=>p.id===Number(o.key))?.price || 0),expectedCurrency:products.find(p=>p.id===Number(o.key))?.currency || "",name:o.name,denomination:o.denomination,currency:o.currency,optionType:"CURRENCY"})) },products);
  return { connection, draft:{...draft,kind:input.deliveryKind,options:draft.options.map(o=>({...o,optionId:input.options.find(r=>Number(r.key)===o.supplierId)!.optionId,supplierKey:String(o.supplierId)}))} };
}

async function findSelectedWupexProducts(db: DB, credentials: WupexCredentials, productId: string, input: SupplierSelection): Promise<WupexProduct[]> {
 if(input.query.trim())return findWupexProducts(credentials,input.options.map(o=>Number(o.key)),input.query,{category:input.category,region:input.region});
 const saved=await db.from("wupex_product_links").select("supplier_product_id,supplier_snapshot").eq("product_id",productId);
 if(saved.error)throw new Error("Saved supplier links could not be checked.");
 const result:WupexProduct[]=[];
 for(let offset=0;offset<input.options.length;offset+=4){
  const groups=await Promise.all(input.options.slice(offset,offset+4).map(o=>{
   const name=saved.data?.find(l=>String(l.supplier_product_id)===o.key)?.supplier_snapshot?.name||o.name;
   return findWupexProducts(credentials,[Number(o.key)],String(name).slice(0,150));
  }));
  result.push(...groups.flat());
 }
 return result;
}
