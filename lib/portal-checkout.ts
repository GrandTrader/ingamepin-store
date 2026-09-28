export type PortalCheckoutInput={action:"quote"|"confirm";requestId:string;reference:string;expectedTotal:number|null;items:{productOptionId:string;quantity:number;customValue?:number;customerInformation?:unknown;playerId?:string}[]};
export function portalCheckoutInput(body:{action?:unknown;requestId?:unknown;reference?:unknown;expectedTotal?:unknown;items?:unknown;paymentMethod?:unknown}):PortalCheckoutInput{
 if(body.paymentMethod!=="wallet")throw Error("B2B orders can only be paid with your iNgamePIN wallet.");
 if(body.action!=="quote"&&body.action!=="confirm")throw Error("Invalid confirmation action.");
 if(typeof body.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))throw Error("Invalid confirmation reference.");
 const reference=typeof body.reference==="string"?body.reference.trim():"";if(reference.length>160)throw Error("Use at most 160 characters for your reference.");
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>100)throw Error("Use between 1 and 100 order lines.");
 const items=body.items.map(item=>{
  if(!item||typeof item.productOptionId!=="string"||!Number.isSafeInteger(item.quantity)||item.quantity<1)throw Error("Invalid order line.");
  if(item.customValue!==undefined&&(typeof item.customValue!=="number"||!Number.isFinite(item.customValue)||item.customValue<=0))throw Error("Invalid card value.");
  return {productOptionId:item.productOptionId,quantity:item.quantity,...(item.customValue!==undefined?{customValue:item.customValue}:{}),...(item.customerInformation?{customerInformation:item.customerInformation}:{}),...(typeof item.playerId==="string"?{playerId:item.playerId}:{})};
 });
 const expectedTotal=typeof body.expectedTotal==="number"?body.expectedTotal:null;
 if(body.action==="confirm"&&(expectedTotal===null||!Number.isFinite(expectedTotal)||expectedTotal<0))throw Error("Review the order before confirming.");
 return {action:body.action,requestId:body.requestId,reference,expectedTotal,items};
}
export type PortalQuote={items:{productName:string;optionName:string;quantity:number;unitPrice:number;lineTotal:number}[];subtotal:number;discount:number;fee:number;total:number;currency:string;walletBalance:number;balanceAfter:number;reference:string;orderId?:string;orderNumber?:string;status?:string;replayed?:boolean};
