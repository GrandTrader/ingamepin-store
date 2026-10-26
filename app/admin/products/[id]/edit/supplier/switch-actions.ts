"use server";
import { revalidatePath, updateTag } from "next/cache";
import { requireWupexAdmin } from "@/lib/wupex-admin";
import { wupexUuid } from "@/lib/wupex-import";
import { supplierCatalogFilters, supplierCatalogue, prepareSupplierConfiguration } from "@/lib/supplier-switch-catalogue";
import { supplierPreviewToken, verifySupplierPreview } from "@/lib/supplier-switch-preview";
import { isSupplier, type SupplierProvider, type SupplierSetup, type SupplierSelection, type SupplierPreview } from "@/lib/supplier-switch";
import { syncWupexProduct } from "@/lib/wupex-fulfillment";
import { requireWupexCredentials } from "@/lib/wupex-storage";
import { syncFKProductStock } from "@/lib/fkwallet-fulfillment";
import { requireCredentials } from "@/lib/fkwallet-storage";
import { getDefinitePlayItems } from "@/lib/definiteplay-relay";

const message = (error: unknown) => error instanceof Error ? error.message : "Supplier settings could not be loaded.";
export async function loadSupplierSwitch(productId: string): Promise<{ data?: SupplierSetup; error?: string }> {
 const { db } = await requireWupexAdmin();
 if (!wupexUuid(productId)) return { error:"Choose a valid product." };
 try {
  const [product, options, settings, version, wx, fk] = await Promise.all([
   db.from("products").select("stock_source").eq("id",productId).single(),
   db.from("product_options").select("id,option_name,denomination,denomination_currency,is_active").eq("product_id",productId).eq("is_custom_value",false).order("sort_order"),
   db.from("product_supplier_settings").select("selection").eq("product_id",productId).maybeSingle(),
   db.rpc("product_supplier_version",{p_product_id:productId}),
   db.from("wupex_imports").select("markup_percent,exchange_rate,wupex_product_links(option_id,supplier_product_id,supplier_snapshot)").eq("product_id",productId).maybeSingle(),
   db.from("fkwallet_imports").select("markup_percent,exchange_rate,supplier_category_id,fkwallet_product_links(option_id,supplier_product_id,supplier_snapshot)").eq("product_id",productId).maybeSingle(),
  ]);
  if (settings.error || version.error) return { error:"Install the supplier switching database update first." };
  if (product.error || options.error || wx.error || fk.error) throw new Error("Product supplier settings could not be loaded.");
  const provider=product.data.stock_source, opts=(options.data??[]).map(o=>({id:o.id,name:o.option_name,denomination:String(o.denomination),currency:o.denomination_currency||"USD",active:o.is_active}));
  let selection=settings.data?.selection as SupplierSelection | undefined;
  const setupProvider=isSupplier(provider)?provider:selection?.provider;
  const imported=setupProvider==="WUPEX" ? wx.data : setupProvider==="FKWALLET" ? fk.data : null;
  let markup=imported ? String(imported.markup_percent) : "";
  const exchangeRate=imported ? String(imported.exchange_rate) : selection?.exchangeRate||"1";
  if (provider==="DEFINITEPLAY") {
   const rules=await db.from("definiteplay_price_rules").select("option_id,base_unit_cost,base_selling_price").in("option_id",opts.filter(o=>o.active).map(o=>o.id));
   if (rules.error) throw new Error("Saved supplier markup could not be loaded.");
   const rates=[...new Set((rules.data??[]).map(r=>((Number(r.base_selling_price)/Number(r.base_unit_cost)-1)*100).toFixed(2)))];
   if(rates.length===1 && Number(rates[0])>=0) markup=rates[0];
  }
  if (!selection && isSupplier(provider)) {
   let links: {option_id:string;key:string;name?:string;kind?:"CODE"|"ACCOUNT"}[]=[];
   if(provider==="WUPEX") links=(wx.data?.wupex_product_links??[]).map(l=>({option_id:l.option_id,key:String(l.supplier_product_id),name:String(l.supplier_snapshot.name||""),kind:l.supplier_snapshot.cardType==="voucher"?"CODE":"ACCOUNT"}));
   else if(provider==="FKWALLET") links=(fk.data?.fkwallet_product_links??[]).map(l=>({option_id:l.option_id,key:String(l.supplier_product_id)}));
   else {
    // Read durable active mappings; the relay's manual editor cache is not authoritative.
    const stock=await db.from("definiteplay_stock").select("option_id,sku").eq("product_id",productId);
    if(stock.error) throw new Error("Supplier mappings could not be loaded.");
    links=(stock.data??[]).map(l=>({...l,key:l.sku}));
   }
   let kind:"CODE"|"ACCOUNT"=links[0]?.kind||"CODE";
   if(provider==="FKWALLET") {const r=await db.from("fkwallet_delivery_settings").select("delivery_kind").eq("product_id",productId).maybeSingle();if(r.error)throw new Error("Delivery type could not be loaded.");kind=r.data?.delivery_kind||"CODE";}
   selection={provider,query:"",category:provider==="FKWALLET"?String(fk.data?.supplier_category_id||""):"",region:"",markup,exchangeRate,deliveryKind:kind,options:links.flatMap(l=>{const o=opts.find(o=>o.id===l.option_id&&o.active);return o?[{key:l.key,optionId:o.id,name:o.name,denomination:o.denomination,currency:o.currency}]:[]})};
  }
  if(!markup && selection?.markup && provider!=="DEFINITEPLAY") markup=selection.markup;
  // Always reflect the current saved markup, including edits made in the existing panel.
  if(selection) {
   let deliveryKind=selection.deliveryKind;
   if(setupProvider==="FKWALLET"||setupProvider==="WUPEX") {const r=await db.from(setupProvider==="FKWALLET"?"fkwallet_delivery_settings":"wupex_delivery_settings").select("delivery_kind").eq("product_id",productId).maybeSingle();if(r.error)throw new Error("Delivery type could not be loaded.");deliveryKind=r.data?.delivery_kind||deliveryKind;}
   selection={...selection,markup,exchangeRate,deliveryKind};
  }
  return {data:{provider,version:version.data,markup,exchangeRate,selection:selection??null,options:opts}};
 } catch(error) {return {error:message(error)};}
}
export async function loadSupplierCatalogFilters(provider: SupplierProvider) {
 await requireWupexAdmin();
 try { return { data: await supplierCatalogFilters(provider) }; }
 catch (error) { return { error: message(error) }; }
}
export async function searchSupplierDenominations(provider:SupplierProvider,query:string,category:string,region:string,page:number) {
 await requireWupexAdmin();
 try{return {data:await supplierCatalogue(provider,query,category,region,page)};}catch(error){return {error:message(error)};}
}
export async function previewSupplierSwitch(productId:string,selection:SupplierSelection):Promise<{data?:SupplierPreview;error?:string}> {
 const {db,userId}=await requireWupexAdmin();
 if(!wupexUuid(productId))return {error:"Choose a valid product."};
 try{
  const version=await db.rpc("product_supplier_version",{p_product_id:productId});
  if(version.error||!version.data)throw new Error("Install the supplier switching database update first.");
  const prepared=await prepareSupplierConfiguration(db,productId,selection);
  const active=await db.from("product_options").select("id,denomination,denomination_currency").eq("product_id",productId).eq("is_active",true);
  if(active.error)throw new Error("Current product options could not be loaded.");
  for(const o of selection.options.filter(o=>o.optionId)){
   const match=await db.from("product_options").select("denomination,denomination_currency,is_custom_value").eq("id",o.optionId!).eq("product_id",productId).maybeSingle();
   if(match.error||!match.data||match.data.is_custom_value||Number(match.data.denomination)!==Number(o.denomination)||match.data.denomination_currency!==o.currency)throw new Error("Match only the same denomination and currency, or choose New option.");
  }
  return {data:{token:supplierPreviewToken(userId,productId,version.data,prepared,selection),version:version.data,selection,
   options:prepared.draft.options.map(o=>({name:o.name,denomination:String(o.denomination),currency:o.currency,cost:String(o.supplierCost),costCurrency:o.supplierCurrency,price:String(o.price)})),
   hiddenCount:(active.data??[]).filter(o=>!selection.options.some(s=>s.optionId===o.id)).length,
   recipientFields:prepared.draft.customerFields?.map(f=>f.label)??[]}};
 }catch(error){return {error:message(error)};}
}
export async function applySupplierSwitch(productId:string,requestId:string,preview:SupplierPreview) {
 const {db,userId}=await requireWupexAdmin();
 if(!wupexUuid(productId)||!wupexUuid(requestId)||!preview?.selection)return {error:"Preview the supplier denominations first."};
 try{
  const previous=await db.from("product_supplier_changes").select("product_id,admin_id,result").eq("id",requestId).maybeSingle();
  if(previous.error)throw new Error("Install the supplier switching database update first.");
  if(previous.data){if(previous.data.product_id!==productId||previous.data.admin_id!==userId)throw new Error("Switch reference already used.");return {success:true,message:"Supplier configuration was already saved."};}
  const prepared=await prepareSupplierConfiguration(db,productId,preview.selection);
  if(!verifySupplierPreview(preview.token,userId,productId,preview.version,prepared,preview.selection))throw new Error("Supplier prices changed or the preview expired. Preview denominations again.");
  const result=await db.rpc("apply_product_supplier_configuration",{p_request_id:requestId,p_product_id:productId,p_admin_id:userId,p_version:preview.version,p_provider:preview.selection.provider,p_connection:prepared.connection,p_draft:prepared.draft,p_selection:preview.selection});
  if(result.error){
   const safe=["Product changed. Preview denominations again","Resolve unfinished website orders before switching or syncing denominations","Resolve unfinished DigiSeller orders before switching or syncing denominations","Resolve reserved codes before switching supplier","Match every denomination with uploaded stock to the same voucher denomination before switching","Disable custom ranges before switching fixed denominations","Match only the same denomination and currency, or add a new option","Start the Wupex delivery worker first","Start the FKWallet delivery worker first"];
   throw new Error(result.error.code==="23505"?"A selected supplier denomination is already linked to another product. No changes were saved.":safe.includes(result.error.message)?result.error.message:"Supplier setup could not be saved. No changes were applied; check the database update and supplier setup.");
  }
  let warning="";
  try{
   if(preview.selection.provider==="WUPEX")await syncWupexProduct(db,await requireWupexCredentials(),productId);
   else if(preview.selection.provider==="FKWALLET")await syncFKProductStock(db,await requireCredentials(),productId);
   else {
    const catalog=await getDefinitePlayItems(preview.selection.options.map(o=>o.key));
    if(catalog.stale)throw new Error("stale");
    // Supplier stock is bounded by the worker's funded catalogue snapshot.
    // The background worker refreshes stock; never turn catalogue presence into quantity.
    warning=" Stock will update on the next supplier refresh.";
   }
  }catch{warning=" Stock is unavailable until the next successful supplier refresh.";}
  updateTag("homepage-store-data"); revalidatePath(`/admin/products/${productId}/edit/supplier`);revalidatePath(`/admin/products/${productId}/edit/options`);revalidatePath("/admin/products");
  return {success:true,message:"Supplier and denominations saved."+warning};
 }catch(error){return {error:message(error)};}
}
