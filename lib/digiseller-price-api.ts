import "server-only";
import { getDigiSellerToken, listDigiSellerProducts } from "./digiseller-api";
import { cents, variantPrice, type PriceSnapshot, type PriceParameter, type PricePlan, type PriceRow, type PriceVariant } from "./digiseller-pricing";

async function request(path: string, body?: unknown) {
  const {token} = await getDigiSellerToken(AbortSignal.timeout(10000));
  const response = await fetch(`https://api.digiseller.com${path}${path.includes('?')?'&':'?'}token=${encodeURIComponent(token)}`, {
    method:body === undefined ? 'GET' : 'POST', headers:{Accept:'application/json','Content-Type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store', signal:AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || (!Array.isArray(result) && result.retval !== 0)) throw new Error("DigiSeller could not complete the price request. Check API access and try again.");
  return result;
}

export async function readPriceSnapshots(ids: number[]): Promise<PriceSnapshot[]> {
  const [owned, details] = await Promise.all([
    listDigiSellerProducts(AbortSignal.timeout(15000)),
    request(`/api/products/list?ids=${ids.join(',')}&lang=en-US`),
  ]);
  if (!Array.isArray(details)) throw new Error("Unable to read DigiSeller base prices.");
  return Promise.all(ids.map(async id => {
    const owner = owned.find(p => p.id === id);
    const detail = details.find(p => Number(p.id) === id);
    if (!owner || !detail || Number(detail.id_seller) !== (await getDigiSellerToken()).sellerId) throw new Error(`DigiSeller product ${id} does not belong to this account.`);
    if (Number(detail.sale_info?.sale_percent ?? 0) !== 0) throw new Error(`End the active DigiSeller sale on product ${id} before syncing prices.`);
    const list = await request(`/api/products/options/list/${id}`);
    if (!Array.isArray(list.content)) throw new Error("Unable to read DigiSeller denominations.");
    const parameters: PriceParameter[] = await Promise.all(list.content.map(async (p: { id: number }) => {
      const result = await request(`/api/products/options/${p.id}`);
      const value = result.content;
      if (!value || Number(value.id) !== Number(p.id) || !Array.isArray(value.variants)) throw new Error("Incomplete DigiSeller denomination details.");
      return {id:Number(value.id),type:value.type,required:value.required === true,variants:value.variants.map((v: PriceParameter['variants'][number]) => ({
        variant_id:Number(v.variant_id),name:v.name,type:v.type,rate:Number(v.rate),is_default:v.is_default,visible:v.visible,order:Number(v.order),
      }))};
    }));
    // The product list uses the legacy WMZ code for a USD base price.
    const currency = detail.base_currency === 'WMZ' ? 'USD' : detail.base_currency;
    return {id,base:Number(detail.base_price),currency,enabled:owner.visible,parameters};
  }));
}

async function setEnabled(id: number, enabled: boolean) {
  await request(`/api/product/edit/base/${id}`,{enabled});
}

async function writeSnapshot(snapshot: PriceSnapshot, deadline: number) {
  await request(`/api/product/edit/base/${snapshot.id}`,{price:{price:snapshot.base,currency:snapshot.currency}});
  for (const p of snapshot.parameters) {
    for (const v of p.variants) {
      if (Date.now() > deadline) throw new Error("The price update took too long. Please retry.");
      await request(`/api/products/options/${p.id}/variants/${v.variant_id}`,{
        name:v.name,type:v.type,rate:v.rate,default:v.is_default,visible:v.visible,order:v.order,
      });
    }
  }
}

function matchesPrices(actual: PriceSnapshot, expected: PriceSnapshot) {
  const parameters=(s:PriceSnapshot)=>s.parameters.map(p=>({id:p.id,type:p.type,required:p.required,variants:p.variants.map(v=>({variant_id:v.variant_id,name:v.name.map(n=>({locale:n.locale,value:n.value})).sort((a,b)=>a.locale.localeCompare(b.locale)),type:v.type,rate:v.rate,is_default:v.is_default,visible:v.visible,order:v.order})).sort((a,b)=>a.variant_id-b.variant_id)})).sort((a,b)=>a.id-b.id);
  return actual.currency === expected.currency && cents(actual.base) === cents(expected.base)
    && JSON.stringify(parameters(actual)) === JSON.stringify(parameters(expected));
}

function modifier(price:number,base:number) {
  const delta=cents(price)-cents(base);
  return {type:delta<0?'priceminus':'priceplus',rate:Math.abs(delta)/100};
}

export async function writePriceSnapshots(snapshots: PriceSnapshot[], options?: {restore?:boolean;beforeEnable?:()=>Promise<void>}) {
  const deadline = Date.now() + 90000;
  // Pause sales until all base prices and modifiers have been verified together.
  for (const s of snapshots) await setEnabled(s.id,false);
  if (options?.restore) {
    const current=await readPriceSnapshots(snapshots.map(s=>s.id));
    // A create request can succeed remotely before timing out. Retain and hide
    // any new IDs during recovery; never delete IDs that an invoice may use.
    snapshots=snapshots.map(s=>({...s,parameters:s.parameters.map(p=>{
      const live=current.find(c=>c.id===s.id);
      const extras=live?.parameters.find(q=>q.id===p.id)?.variants.filter(v=>!p.variants.some(old=>old.variant_id===v.variant_id))??[];
      return {...p,variants:[...p.variants,...extras.map(v=>({...v,...modifier(variantPrice(live!.base,v),s.base),visible:false,is_default:false}))]};
    })}));
  }
  for (const s of snapshots) await writeSnapshot(s,deadline);
  const verified = await readPriceSnapshots(snapshots.map(s => s.id));
  if (snapshots.some(s => !verified.some(v => v.id === s.id && matchesPrices(v,s)))) throw new Error("DigiSeller price verification failed.");
  await options?.beforeEnable?.();
  for (const s of snapshots) if (s.enabled) await setEnabled(s.id,true);
}

export function targetPriceSnapshots(plan: PricePlan): PriceSnapshot[] {
  return plan.products.map(group => ({...group.before,base:group.base,parameters:group.before.parameters.map(p => ({...p,variants:p.variants.map(v => {
    const row = group.rows.find(r => r.variantId === v.variant_id);
    if (!row) {
      if (v.visible && plan.mode!=='denominations') throw new Error("A DigiSeller denomination is not matched.");
      return {...v,...modifier(variantPrice(group.before.base,v),group.base),visible:false,is_default:false};
    }
    if (plan.mode==='denominations') {
      const oldDefault=p.variants.find(old=>old.is_default&&group.rows.some(r=>r.variantId===old.variant_id));
      const defaultId=oldDefault?.variant_id??group.rows[0].variantId;
      return {...v,...modifier(row.next,group.base),visible:true,is_default:v.variant_id===defaultId,order:group.rows.indexOf(row)+1,
        name:row.change==='Rename'?v.name.map(n=>({...n,value:row.name})):v.name};
    }
    return {...v,...modifier(row.next,group.base)};
  })}))}));
}

export async function writeDenominationPlan(plan:PricePlan, saveMappings:(rows:PriceRow[])=>Promise<void>) {
  if (plan.mode!=='denominations' || plan.products.length!==1) throw new Error('Invalid denomination sync.');
  const group=structuredClone(plan.products[0]);
  const parameter=group.before.parameters[0];
  const deadline=Date.now()+90000;
  await setEnabled(group.before.id,false);
  for (const row of group.rows) {
    if (row.variantId!==null) continue;
    if (Date.now()>deadline) throw new Error('Creating denominations took too long. Restore the previous prices and retry.');
    const variant={name:[{locale:'en-US',value:row.name},{locale:'ru-RU',value:row.name}],...modifier(row.next,group.before.base),default:false,order:parameter.variants.length+1};
    const created=await request(`/api/products/options/${parameter.id}/variants`,{variants:[variant]});
    const ids=created.content?.variants;
    if (!Array.isArray(ids)||ids.length!==1||!Number.isSafeInteger(Number(ids[0]))||Number(ids[0])<=0) throw new Error('DigiSeller did not confirm the new denomination ID.');
    row.variantId=Number(ids[0]);
    const added:PriceVariant={variant_id:row.variantId,name:variant.name,type:variant.type,rate:variant.rate,is_default:false,visible:true,order:variant.order};
    parameter.variants.push(added);
  }
  const resolved={...plan,products:[group]};
  await writePriceSnapshots(targetPriceSnapshots(resolved),{beforeEnable:()=>saveMappings(group.rows)});
}
