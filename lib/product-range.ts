export type ProductRange = {
  product_id:string; option_id:string; enabled:boolean; currency:string;
  minimum:number; maximum:number; step:number; price_basis:number; price_usd:number;
  delivery_mode:"MANUAL"|"SUPPLIER"; supplier:string|null; supplier_reference:string|null;
};
export function rangePrice(range:ProductRange,value:number){
  if(!range.enabled)throw Error("Range purchasing is disabled for this product.");
  const cents=Math.round(value*100),low=Math.round(Number(range.minimum)*100),step=Math.round(Number(range.step)*100);
  if(!Number.isFinite(value)||Math.abs(value*100-cents)>0.000001||cents<low||value>Number(range.maximum)||step<1||(cents-low)%step!==0)throw Error(`Enter a denomination from ${range.minimum} to ${range.maximum} ${range.currency}, in steps of ${range.step}.`);
  const basis=BigInt(Math.round(Number(range.price_basis)*100));
  const price=basis>BigInt(0)?Number((BigInt(cents)*BigInt(Math.round(Number(range.price_usd)*100))*BigInt(2)+basis)/(BigInt(2)*basis))/100:NaN;
  if(!Number.isFinite(price)||price<=0)throw Error("This denomination does not have a valid selling price.");
  return price;
}
export function parseRangeSettings(form:FormData){
  const enabled=form.get("enabled")==="on";
  const currency=String(form.get("currency")??"").trim().toUpperCase();
  const number=(key:string)=>Number(String(form.get(key)??""));
  const minimum=number("minimum"),maximum=number("maximum"),step=number("step"),price_basis=number("price_basis"),price_usd=number("price_usd");
  for(const value of [minimum,maximum,step,price_basis,price_usd])if(!Number.isFinite(value)||value<=0||value>1000000||Math.abs(value*100-Math.round(value*100))>0.000001)throw Error("Enter positive amounts with up to two decimal places.");
  if(maximum<minimum||step>maximum||!Number.isInteger(price_basis)||!/^([A-Z]{3})$/.test(currency))throw Error("Check the denomination range, currency and pricing basis.");
  const delivery_mode=String(form.get("delivery_mode")??"");
  if(!["MANUAL","SUPPLIER"].includes(delivery_mode))throw Error("Choose a delivery method.");
  const supplier=String(form.get("supplier")??"").trim();
  if(delivery_mode==="SUPPLIER"&&!["DEFINITEPLAY","GIFTPORT"].includes(supplier))throw Error("Choose a supplier.");
  return {enabled,currency,minimum,maximum,step,price_basis,price_usd,delivery_mode,supplier:delivery_mode==="SUPPLIER"?supplier:null,supplier_reference:String(form.get("supplier_reference")??"").trim().slice(0,100)||null};
}
