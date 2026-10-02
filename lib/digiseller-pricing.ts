export type PriceOption = {
  id: string; name: string; price: number;
  productId: number | null; optionId: number | null; variantId: number | null;
};
export type PriceVariant = {
  variant_id: number; name: Array<{ locale: string; value: string }>;
  type: string; rate: number; is_default: boolean; visible: boolean; order: number;
};
export type PriceParameter = { id: number; type: string; required: boolean; variants: PriceVariant[] };
export type PriceSnapshot = {
  id: number; base: number; currency: string; enabled: boolean; parameters: PriceParameter[];
};
export type PriceRow = { id: string; name: string; website: number; current: number; next: number; productId: number; optionId: number | null; variantId: number | null; change?: 'Add' | 'Rename' | 'Show' | 'Update' | 'Hide'; previousName?: string };
export type PricePlan = { percent: number; rows: PriceRow[]; products: Array<{ before: PriceSnapshot; base: number; rows: PriceRow[] }>; mode?: 'denominations'; websiteOptions?: PriceOption[] };

export function parsePriceAdjustment(value: string) {
  if (!/^[+-]?\d{1,4}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a percentage with up to two decimal places.");
  const percent = Number(value);
  if (percent < -99.99 || percent > 1000) throw new Error("Enter an adjustment between -99.99% and 1000%.");
  return percent;
}

export function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error("Invalid price. Prices must be between $0.01 and $1,000,000.");
  return Math.round((value + Number.EPSILON) * 100);
}

export function adjustedPrice(price: number, percent: number) {
  // Integer cents and basis points avoid binary rounding and repeated markups.
  const result = Math.floor((cents(price) * (10000 + Math.round(percent * 100)) + 5000) / 10000);
  if (result < 1 || result > 100000000) throw new Error("The adjustment would produce a price outside $0.01–$1,000,000.");
  return result / 100;
}

export function variantPrice(base: number, variant: PriceVariant) {
  if (!Number.isFinite(variant.rate) || variant.rate < 0) throw new Error("Invalid DigiSeller price modifier.");
  switch (variant.type) {
    case "priceplus": return cents(base + variant.rate) / 100;
    case "priceminus": return cents(base - variant.rate) / 100;
    case "percentplus": return cents(base * (1 + variant.rate / 100)) / 100;
    case "percentminus": return cents(base * (1 - variant.rate / 100)) / 100;
    default: throw new Error("Unsupported DigiSeller price modifier.");
  }
}

export function buildPricePlan(options: PriceOption[], snapshots: PriceSnapshot[], rawPercent: string): PricePlan {
  const percent = parsePriceAdjustment(rawPercent);
  if (!options.length) throw new Error("This product has no active denominations.");
  if (options.length > 100) throw new Error("A maximum of 100 denominations can be updated at once.");
  if (options.some(o => !o.productId)) throw new Error("Connect every active denomination to DigiSeller first.");
  const rows: PriceRow[] = [];
  const products: PricePlan["products"] = [];
  for (const id of [...new Set(options.map(o => o.productId!))].sort((a,b) => a-b)) {
    const before = snapshots.find(s => s.id === id);
    if (!before || before.currency !== "USD" || cents(before.base) < 1) throw new Error(`DigiSeller product ${id} must have a valid USD base price.`);
    const mapped = options.filter(o => o.productId === id);
    const parameters = before.parameters;
    if (parameters.length > 1) throw new Error(`Product ${id} has additional parameters. Only a single denomination parameter is supported.`);
    const parameter = parameters[0];
    if (parameter && (!['radio','select'].includes(parameter.type) || !parameter.required)) throw new Error(`Product ${id} must use one required denomination selector.`);
    if (!parameter && (mapped.length !== 1 || mapped[0].optionId || mapped[0].variantId)) throw new Error(`Check the denomination matches for product ${id}.`);
    if (parameter && (mapped.length !== parameter.variants.filter(v=>v.visible).length || new Set(mapped.map(o => o.variantId)).size !== mapped.length)) throw new Error(`Every visible DigiSeller denomination of product ${id} must be matched exactly once. Use denomination sync after changing the options.`);
    const group = mapped.map(o => {
      const variant = parameter?.variants.find(v => v.variant_id === o.variantId);
      if (parameter && (!variant || !variant.visible || parameter.id !== o.optionId)) throw new Error(`Sync the DigiSeller denomination for ${o.name} first.`);
      if (!Number.isFinite(o.price) || o.price <= 0) throw new Error(`Set a selling price for ${o.name}.`);
      return { id:o.id, name:o.name, website:o.price, current:variant ? variantPrice(before.base,variant) : before.base,
        next:adjustedPrice(o.price,percent), productId:id, optionId:o.optionId, variantId:o.variantId };
    });
    rows.push(...group);
    products.push({ before, base:Math.min(...group.map(r => r.next)), rows:group });
  }
  return {percent,rows,products};
}

export function buildDenominationPlan(options: PriceOption[], before: PriceSnapshot, rawPercent: string): PricePlan {
  const percent=parsePriceAdjustment(rawPercent);
  if (!options.length || options.length>100) throw new Error('Keep between 1 and 100 active website denominations.');
  if (before.currency!=='USD' || cents(before.base)<1) throw new Error('The DigiSeller listing must use a USD base price.');
  const parameter=before.parameters[0];
  if (before.parameters.length!==1 || !parameter.required || !['radio','select'].includes(parameter.type)) throw new Error('Connect a DigiSeller listing with one required denomination selector first.');
  const label=(v:PriceVariant)=>v.name.find(n=>n.locale==='en-US')?.value||v.name[0]?.value||'';
  const normalize=(s:string)=>s.trim().toLowerCase();
  if (options.some(o=>!o.name.trim()) || new Set(options.map(o=>normalize(o.name))).size!==options.length) throw new Error('Give each website denomination a different name.');
  const assigned=new Set(options.flatMap(o=>o.variantId===null?[]:[o.variantId]));
  if (assigned.size!==options.filter(o=>o.variantId!==null).length) throw new Error('Two website denominations are matched to the same DigiSeller option.');
  const used=new Set<number>();
  const rows:PriceRow[]=options.map(o=>{
    if (o.productId!==null && o.productId!==before.id) throw new Error('Denomination sync supports one DigiSeller listing per website product.');
    if (o.optionId!==null && o.optionId!==parameter.id) throw new Error(`Check the DigiSeller match for ${o.name}.`);
    let variant=parameter.variants.find(v=>v.variant_id===o.variantId);
    if (o.variantId!==null && !variant) throw new Error(`The saved DigiSeller option for ${o.name} is missing. Clear its old match first.`);
    if (!variant) {
      const matches=parameter.variants.filter(v=>!assigned.has(v.variant_id)&&!used.has(v.variant_id)&&normalize(label(v))===normalize(o.name));
      if (matches.length>1) throw new Error(`Several DigiSeller options match ${o.name}. Match this denomination manually first.`);
      variant=matches[0];
    }
    if (variant) used.add(variant.variant_id);
    if (!Number.isFinite(o.price)||o.price<=0) throw new Error(`Set a selling price for ${o.name}.`);
    return {id:o.id,name:o.name,website:o.price,current:variant?variantPrice(before.base,variant):0,next:adjustedPrice(o.price,percent),productId:before.id,optionId:parameter.id,variantId:variant?.variant_id??null,
      change:!variant?'Add':label(variant)!==o.name?'Rename':!variant.visible?'Show':'Update',previousName:variant?label(variant):undefined};
  });
  const hidden:PriceRow[]=parameter.variants.filter(v=>!used.has(v.variant_id)&&v.visible).map(v=>({id:`hide-${v.variant_id}`,name:label(v),website:0,current:variantPrice(before.base,v),next:0,productId:before.id,optionId:parameter.id,variantId:v.variant_id,change:'Hide'}));
  return {mode:'denominations',websiteOptions:options,percent,rows:[...rows,...hidden],products:[{before,base:Math.min(...rows.map(r=>r.next)),rows}]};
}
