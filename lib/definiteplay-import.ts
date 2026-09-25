import type {DefinitePlayItem} from "./definiteplay-types";

export function supplierProductVariant(item:Pick<DefinitePlayItem,"name">):"regular"|"discounted" {
  return /\bdiscount(?:ed)?\b/i.test(item.name) ? "discounted" : "regular";
}

export type SupplierImportInput = {
  requestId:string; categoryId:string; title:string; titleRu:string;
  description:string; descriptionRu:string; markup:string;
  options:{sku:string;expectedCost:string;price?:string;denomination:string;currency:string}[];
};
function text(value:unknown,label:string,min:number,max:number) {
  if(typeof value!=="string" || value.trim().length<min || value.trim().length>max) throw new Error(label+" has an invalid length.");
  return value.trim();
}
function decimal(value:unknown,places:number,label:string):bigint {
  if(typeof value!=="string" || value.length>24 || !new RegExp("^\\d+(?:\\.\\d{1,"+places+"})?$").test(value)) throw new Error("Enter a valid "+label+".");
  const [whole,fraction=""]=value.split(".");
  return BigInt(whole)*BigInt(10)**BigInt(places)+BigInt(fraction.padEnd(places,"0"));
}
export function priceWithMarkup(cost:string,markup:string) {
  const rate=decimal(markup,2,"markup percentage");
  if(rate>BigInt(100000)) throw new Error("Markup must be between 0% and 1,000%.");
  const numerator=decimal(cost,8,"supplier cost")*(BigInt(10000)+rate);
  const divisor=BigInt(10000000000);
  const cents=(numerator+divisor/BigInt(2))/divisor;
  if(cents<BigInt(1) || cents>BigInt(999999999)) throw new Error("Selling price must be between USD 0.01 and 9,999,999.99.");
  return (cents/BigInt(100)).toString()+"."+(cents%BigInt(100)).toString().padStart(2,"0");
}
export function prepareSupplierDraft(input:SupplierImportInput,items:DefinitePlayItem[]) {
  if(!input || !Array.isArray(input.options) || input.options.length<1 || input.options.length>50) throw new Error("Select between 1 and 50 supplier items.");
  const title=text(input.title,"English title",2,150);
  const titleRu=text(input.titleRu,"Russian title",0,150);
  const description=text(input.description,"English description",0,5000);
  const descriptionRu=text(input.descriptionRu,"Russian description",0,5000);
  // Validate the markup even when every row has a manual price.
  priceWithMarkup("1",input.markup);
  const seen=new Set<string>();const groups=new Set<string>();
  const options=input.options.map(row=>{
    if(!row || typeof row.sku!=="string" || seen.has(row.sku)) throw new Error("Select each supplier item only once.");
    seen.add(row.sku);
    const item=items.find(i=>i.sku===row.sku);
    if(!item)throw new Error("A selected supplier item is no longer available in the catalogue. Refresh and try again.");
    if(item.currency!=="USD")throw new Error("Only supplier costs in USD can be imported. No exchange rate is applied.");
    if(decimal(item.price,8,"supplier cost")!==decimal(row.expectedCost,8,"supplier cost"))throw new Error("A supplier cost has changed. Refresh the import page and review the new prices.");
    groups.add(item.brand.trim().toLowerCase()+"|"+item.region.trim().toLowerCase()+"|"+supplierProductVariant(item));
    const suggested=priceWithMarkup(item.price,input.markup);
    let sellingPrice=suggested;
    if(row.price!==undefined && row.price!=="") {
      const cents=decimal(row.price,2,"selling price");
      if(cents<BigInt(1)||cents>BigInt(999999999))throw new Error("Enter a selling price between USD 0.01 and 9,999,999.99.");
      sellingPrice=(Number(cents)/100).toFixed(2);
    }
    const denomination=Number(row.denomination);
    if(typeof row.denomination!=="string" || !/^\d+(?:\.\d{1,4})?$/.test(row.denomination) || !Number.isFinite(denomination) || denomination<=0 || denomination>1000000000)throw new Error("Enter a positive denomination for every option.");
    if(typeof row.currency!=="string" || !/^[A-Z]{3}$/.test(row.currency))throw new Error("Use a three-letter denomination currency.");
    return {sku:item.sku,name:item.name.slice(0,150)||item.sku,denomination,currency:row.currency,price:Number(sellingPrice)};
  });
  if(groups.size!==1)throw new Error("Import one supplier category, region and product version at a time.");
  const region=items.find(i=>i.sku===options[0].sku)!.region.trim()||"Global";
  if(region.length>100)throw new Error("Supplier region is too long.");
  return {title,titleRu,description,descriptionRu,region,options};
}
