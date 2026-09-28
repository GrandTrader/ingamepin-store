import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
async function paymentFailed(request:NextRequest, orderId:string) {
  let destination="/checkout/payment";
  if (/^[a-f0-9-]{36}$/i.test(orderId)) {
    const result=await createAdminClient().from("wallet_topup_requests").select("return_to_business").eq("id",orderId).eq("payment_method","PALLY").maybeSingle();
    if (result.data) destination=result.data.return_to_business ? "/account/portal/wallet" : "/account/wallet";
  }
  return NextResponse.redirect(new URL(`${destination}?error=Paypalych+payment+was+not+completed`,request.url),303);
}
export async function POST(request:NextRequest){
  const form=await request.formData();
  return paymentFailed(request,String(form.get("InvId")??form.get("MERCHANT_ORDER_ID")??form.get("o")??"").trim());
}
