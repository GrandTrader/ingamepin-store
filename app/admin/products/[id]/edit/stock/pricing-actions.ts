"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPricePlan, buildDenominationPlan, type PricePlan, type PriceSnapshot, type PriceRow } from "@/lib/digiseller-pricing";
import { readPriceSnapshots, targetPriceSnapshots, writePriceSnapshots, writeDenominationPlan } from "@/lib/digiseller-price-api";

async function requireAdmin() {
  const session = await createClient();
  const {data:{user}} = await session.auth.getUser();
  if (!user) throw new Error("Sign in as an administrator.");
  const access = await session.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if (access.error || !access.data) throw new Error("Administrator access required.");
  return user.id;
}

async function planFor(productId: string, percent: string, mode: 'prices'|'denominations' = 'prices') {
  if (mode !== 'prices' && mode !== 'denominations') throw new Error('Choose a valid sync type.');
  const admin = createAdminClient();
  let query = admin.from('product_options').select('id,option_name,selling_price,is_active,digiseller_product_id,digiseller_option_id,digiseller_variant_id')
    .eq('product_id',productId).eq('is_custom_value',false);
  if (mode === 'prices') query = query.eq('is_active',true);
  const result = await query.order('sort_order').order('id');
  if (result.error) throw new Error("Unable to read this product's denominations.");
  const options = (result.data ?? []).filter(o=>mode==='prices'||o.is_active).map(o => ({id:o.id,name:o.option_name,price:Number(o.selling_price),productId:o.digiseller_product_id === null ? null : Number(o.digiseller_product_id),optionId:o.digiseller_option_id === null ? null : Number(o.digiseller_option_id),variantId:o.digiseller_variant_id === null ? null : Number(o.digiseller_variant_id)}));
  const ids = [...new Set((result.data ?? []).map(o=>o.digiseller_product_id).filter(id=>id!==null).map(Number))].sort((a,b)=>a-b);
  if (!ids.length || (mode==='prices' && options.some(o => o.productId === null))) throw new Error("Connect the product to DigiSeller first. Use denomination sync to add unmatched denominations.");
  if (mode==='denominations' && ids.length!==1) throw new Error('Denomination sync requires one connected DigiSeller listing for this product.');
  if (ids.length > 5) throw new Error("This tool supports up to five connected DigiSeller listings per website product.");
  const shared = await admin.from('product_options').select('id',{head:true,count:'exact'}).in('digiseller_product_id',ids).neq('product_id',productId);
  if (shared.error || shared.count) throw new Error("A DigiSeller listing is shared with another website product. Give each website product its own listing before updating prices.");
  const snapshots=await readPriceSnapshots(ids);
  return mode==='denominations' ? buildDenominationPlan(options,snapshots[0],percent) : buildPricePlan(options,snapshots,percent);
}

async function saveDenominationMappings(productId:string, plan:PricePlan, rows:PriceRow[]) {
  const admin=createAdminClient();
  for (const row of rows) {
    const original=plan.websiteOptions?.find(o=>o.id===row.id);
    if (!original || row.variantId===null) throw new Error('Missing denomination mapping.');
    // Check the saved denomination has not changed while remote writes ran.
    let query=admin.from('product_options').update({digiseller_product_id:row.productId,digiseller_option_id:row.optionId,digiseller_variant_id:row.variantId})
      .eq('id',row.id).eq('product_id',productId).eq('is_active',true).eq('is_custom_value',false).eq('option_name',original.name).eq('selling_price',original.price);
    for (const [field,value] of [['digiseller_product_id',original.productId],['digiseller_option_id',original.optionId],['digiseller_variant_id',original.variantId]] as const) {
      query=value===null?query.is(field,null):query.eq(field,value);
    }
    const saved=await query.select('id');
    if (saved.error || saved.data?.length!==1) throw new Error('A website denomination changed during sync. Preview again after recovery.');
  }
}

function sign(plan: PricePlan, productId: string, adminId: string, expires: number) {
  const key=process.env.DIGISELLER_API_KEY;
  if (!key) throw new Error("DigiSeller is not configured.");
  return createHmac('sha256',key).update(JSON.stringify({plan,productId,adminId,expires})).digest('hex');
}

export async function previewDigiSellerPrices(productId: string, percent: string, mode:'prices'|'denominations'='prices') {
  const userId=await requireAdmin();
  try {
    const plan=await planFor(productId,percent,mode);
    const expires=Date.now()+10*60*1000;
    return {rows:plan.rows,approval:`${expires}.${sign(plan,productId,userId,expires)}`,error:null};
  } catch (error) {
    return {rows:[],approval:null,error:error instanceof Error ? error.message : 'Unable to preview prices.'};
  }
}

export async function applyDigiSellerPrices(productId: string, percent: string, approval: string, mode:'prices'|'denominations'='prices') {
  const userId=await requireAdmin();
  const admin=createAdminClient();
  let token: string | null=null;
  let plan: PricePlan | null=null;
  let started=false;
  let pricesWritten=false;
  try {
    const [expiry,signature]=approval.split('.');
    const expires=Number(expiry);
    if (!Number.isSafeInteger(expires) || expires<Date.now() || expires>Date.now()+10*60*1000 || !/^[a-f0-9]{64}$/.test(signature ?? '')) throw new Error("Preview the prices again before applying them.");
    plan=await planFor(productId,percent,mode);
    if (!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(plan,productId,userId,expires),'hex'))) throw new Error("Prices or denomination matches changed. Preview again before applying.");
    const lock=await admin.rpc('begin_digiseller_price_sync',{p_product_id:productId,p_snapshot:plan.products.map(p=>p.before)});
    if (lock.error || !lock.data) throw new Error(lock.error?.message || 'Unable to start the price update.');
    token=lock.data;
    const current=await readPriceSnapshots(plan.products.map(p=>p.before.id));
    if (JSON.stringify(current)!==JSON.stringify(plan.products.map(p=>p.before))) throw new Error("DigiSeller prices changed. Preview again before applying.");
    started=true;
    if (plan.mode==='denominations') {
      const approvedPlan=plan;
      await writeDenominationPlan(plan,rows=>saveDenominationMappings(productId,approvedPlan,rows));
    } else await writePriceSnapshots(targetPriceSnapshots(plan));
    pricesWritten=true;
    const finish=await admin.rpc('finish_digiseller_price_sync',{p_product_id:productId,p_token:token,p_percent:plan.percent,p_success:true,p_restored:false});
    if (finish.error) throw new Error('Could not save the completed price update.');
    revalidatePath(`/admin/products/${productId}/edit/digiseller`);
    return {success:true,message:`Updated ${plan.rows.length} denominations on DigiSeller.`,needsRecovery:false};
  } catch (error) {
    // A timed-out finish RPC may already have committed. Do not undo verified
    // live prices after that point; the saved backup allows explicit recovery.
    if (pricesWritten) {
      revalidatePath(`/admin/products/${productId}/edit/digiseller`);
      return {success:false,message:'DigiSeller prices were updated and verified, but saving the sync status could not be confirmed. Refresh this page to check the saved status before another update.',needsRecovery:true};
    }
    let restored=!started;
    if (token && plan) {
      if (started) {
        try { await writePriceSnapshots(plan.products.map(p=>p.before),{restore:true}); restored=true; } catch { restored=false; }
      }
      const finished=await admin.rpc('finish_digiseller_price_sync',{p_product_id:productId,p_token:token,p_percent:0,p_success:false,p_restored:restored,p_error:restored ? 'Update failed; previous prices retained.' : 'Restore previous prices before another update.'});
      if (finished.error) restored=false;
    }
    revalidatePath(`/admin/products/${productId}/edit/digiseller`);
    const message=error instanceof Error ? error.message : 'Unable to update DigiSeller prices.';
    return {success:false,message:token ? (restored ? `${message} Previous prices have been retained.` : 'The update could not finish. Use Restore previous prices before another update. Affected listings may be paused.') : message,needsRecovery:!!token && !restored};
  }
}

export async function restoreDigiSellerPrices(productId: string) {
  await requireAdmin();
  const admin=createAdminClient();
  const lock=await admin.rpc('begin_digiseller_price_sync',{p_product_id:productId,p_snapshot:null,p_recover:true});
  if (lock.error || !lock.data) return {success:false,message:lock.error?.message || 'Unable to restore prices.',needsRecovery:true};
  let success=false;
  try {
    const saved=await admin.from('digiseller_price_settings').select('recovery_snapshot').eq('product_id',productId).single();
    if (saved.error || !Array.isArray(saved.data?.recovery_snapshot)) throw new Error('Unable to read the previous prices.');
    await writePriceSnapshots(saved.data.recovery_snapshot as PriceSnapshot[],{restore:true});
    success=true;
  } catch { success=false; }
  const finish=await admin.rpc('finish_digiseller_price_sync',{p_product_id:productId,p_token:lock.data,p_percent:0,p_success:false,p_restored:success,p_error:success ? null : 'Previous prices still need restoring.'});
  if (finish.error) success=false;
  revalidatePath(`/admin/products/${productId}/edit/digiseller`);
  return {success,message:success ? 'Previous DigiSeller prices restored.' : 'Unable to restore all prices. Please retry; affected listings may be paused.',needsRecovery:!success};
}
