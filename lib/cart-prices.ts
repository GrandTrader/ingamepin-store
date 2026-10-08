export type PriceCartItem={productOptionId?:string;customValue?:number;quantity:number;price?:number;unitPrice?:number;totalPrice?:number;salePercent?:number;regularPrice?:number;saleEndsAt?:string|null;expectedSaleUnitPrice?:number};
export async function refreshCartPrices<T extends PriceCartItem>(items:T[],signal?:AbortSignal):Promise<T[]>{
 if(!items.length)return items;
 const response=await fetch("/api/products/prices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items.map(i=>({productOptionId:i.productOptionId,customValue:i.customValue}))}),cache:"no-store",signal});
 const result=await response.json();
 if(!response.ok||!Array.isArray(result.prices)||result.prices.length!==items.length)throw Error(result.error||"Unable to refresh current prices.");
 return items.map((item,index)=>{
  const quote=result.prices[index];
  if(quote.index!==index||quote.productOptionId!==item.productOptionId||!Number.isFinite(quote.price)||quote.price<=0)throw Error("Unable to verify current prices.");
  return {...item,price:quote.price,unitPrice:quote.price,totalPrice:quote.price*item.quantity,regularPrice:quote.regularPrice,salePercent:quote.salePercent,saleEndsAt:quote.saleEndsAt,expectedSaleUnitPrice:quote.expectedSaleUnitPrice};
 });
}
export function pricesChanged(before:PriceCartItem[],after:PriceCartItem[]){
 return before.some((item,i)=>Math.round(Number(item.unitPrice??item.price)*100)!==Math.round(Number(after[i]?.unitPrice??after[i]?.price)*100)||Number(item.salePercent??0)!==Number(after[i]?.salePercent??0));
}
