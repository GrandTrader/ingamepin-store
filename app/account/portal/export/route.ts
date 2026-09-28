import { portalCustomer, customerOrders, customerStatement } from "@/lib/business-portal-data";
import { csv, portalDate } from "@/lib/business-portal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const {user,email}=await portalCustomer();
  const params=new URL(request.url).searchParams, kind=params.get("kind"), filters=Object.fromEntries(params.entries());
  let rows:unknown[][]=[], filename="", text:string|undefined;
  if(kind==="codes") {
    const id=params.get("order")??"", item=params.get("item");
    if(!/^[a-f0-9-]{36}$/i.test(id))return new Response("Order not found",{status:404});
    const result=await createAdminClient().from("orders").select("id,order_number,status,order_items(id,product_name,option_name)").eq("id",id).eq("customer_email",email).eq("sales_channel","BUSINESS").maybeSingle();
    if(result.error) return new Response("Unable to load order",{status:503});
    if(!result.data||!["PAID","PROCESSING","DELIVERED"].includes(result.data.status))return new Response("Order not found",{status:404});
    const order=result.data;
    const items=order.order_items.filter(i=>!item||i.id===item);
    if(!items.length)return new Response("Item not found",{status:404});
    const codes=await getAllDeliveredCodes(items.map(i=>i.id));
    if(!codes.length)return new Response("No delivered codes are available for this item yet.",{status:404,headers:{"Cache-Control":"private, no-store"}});
    rows=[["Order","Product","Option","Code"],...codes.map(c=>{const i=items.find(i=>i.id===c.order_item_id)!;return [order.order_number,i.product_name,i.option_name,c.code];})];
    if(params.get("format")==="txt")text=codes.map(c=>c.code).join("\r\n");
    filename="delivered-codes";
  } else if(kind==="orders"||kind==="statement") {
    rows=kind==="orders"?[["Order","Date (IST)","Product","Option","Quantity","Status","Order total","Currency"]]:[["Date (IST)","Type","Reference","Description","Debit USD","Credit USD","Balance USD"]];
    for(let from=0;;from+=500) {
      if(kind==="orders") {
        const r=await customerOrders(email,filters).range(from,from+499);if(r.error)return new Response("Unable to export orders",{status:503});
        for(const o of r.data)for(const i of o.order_items)rows.push([o.order_number,portalDate(o.created_at),i.product_name,i.option_name,i.quantity,o.status,o.total,o.currency]);
        if(r.data.length<500)break;
      } else {
        const r=await customerStatement(user.id,filters).range(from,from+499);if(r.error)return new Response("Unable to export statement",{status:503});
        for(const t of r.data)rows.push([portalDate(t.created_at),t.transaction_type,t.reference_id??t.id,t.description,t.transaction_type==="DEBIT"?t.amount:"",t.transaction_type!=="DEBIT"?t.amount:"",t.balance_after]);
        if(r.data.length<500)break;
      }
    }
    filename=kind;
  } else return new Response("Invalid export",{status:400});
  const plain=text!==undefined;
  return new Response(text??csv(rows),{headers:{"Content-Type":plain?"text/plain; charset=utf-8":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ingamepin-${filename}.${plain?"txt":"csv"}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
