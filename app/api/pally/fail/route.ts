import { syncFailedGatewayPayments } from "@/lib/payment-failure-sync";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
async function paymentFailed(request:NextRequest, orderId:string) {
  let destination="/checkout/payment";
  // Browser returns are not proof of failure. Always check the provider.
  if (/^[a-f0-9-]{36}$/i.test(orderId)) {
    try {
      const sync = await syncFailedGatewayPayments({ orderIds: [orderId], method: "PALLY" });
      if (sync.releasedOrderIds.includes(orderId)) destination="/checkout";
      else {
        const saved = await createAdminClient().from("orders").select("status").eq("id", orderId).maybeSingle();
        if (!saved.error && saved.data?.status === "CANCELLED") destination="/checkout";
      }
    } catch { console.error("Payment failure return could not be checked"); }
  }
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

export async function GET(request:NextRequest){
  return paymentFailed(request,request.nextUrl.searchParams.get("InvId")??request.nextUrl.searchParams.get("o")??"");
}
