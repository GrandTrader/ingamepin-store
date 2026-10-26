import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { customerDeviceDetails } from "./customer-device-details";
import { REPORT_TIME_ZONES, type CustomerReport } from "./customer-report-data";
import { summaryMoney } from "./wallet-activity-summary";

const PAGE_WIDTH=841.89,PAGE_HEIGHT=595.28,MARGIN=38,WIDTH=PAGE_WIDTH-2*MARGIN;
const ink=rgb(.07,.13,.23),muted=rgb(.32,.39,.48),blue=rgb(.08,.29,.65),line=rgb(.84,.88,.92),pale=rgb(.95,.97,.99);
export async function createCustomerReportPdf(report:CustomerReport):Promise<Uint8Array>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const folder=path.join(process.cwd(),"lib/assets/customer-report-fonts");
 const [regularBytes,boldBytes]=await Promise.all([readFile(path.join(folder,"NotoSans-Regular.ttf")),readFile(path.join(folder,"NotoSans-Bold.ttf"))]);
 const normal=await doc.embedFont(regularBytes,{subset:true}),bold=await doc.embedFont(boldBytes,{subset:true});
 doc.setTitle("Customer activity report - "+report.customer.name);doc.setAuthor("InGamePin");doc.setSubject("Customer details, wallet activity and product purchases");doc.setCreationDate(new Date(report.generatedAt));
 const supported=new Set(normal.getCharacterSet());
 let unsupported=false;
 function clean(value:unknown){return String(value??"Not recorded").normalize("NFC").replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,"").replace(/[\u2010-\u2015]/g,"-").replace(/./gu,c=>{if(c==='\n'||c==='\t'||supported.has(c.codePointAt(0)!))return c;unsupported=true;return `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`;}).replace(/\t/g," ");}
 const formatDate=new Intl.DateTimeFormat("en-GB",{timeZone:report.timeZone,year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const date=(s:string|null|undefined)=>s&&Number.isFinite(Date.parse(s))?formatDate.format(new Date(s)):"Not recorded";
 const money=(amount:number|string|null|undefined,currency=report.wallet.currency)=>amount==null?"Not recorded":Number(amount).toFixed(2)+" "+currency;
 const zone=REPORT_TIME_ZONES[report.timeZone as keyof typeof REPORT_TIME_ZONES];
 let page!:PDFPage,y=0,sectionName="Account overview";
 function draw(value:unknown,x:number,top:number,size=9,font=normal,color=ink){page.drawText(clean(value),{x,y:PAGE_HEIGHT-top-size,size,font,color});}
 function wrap(value:unknown,width:number,size=9,font:PDFFont=normal):string[]{
  const result:string[]=[];
  for(const paragraph of clean(value).split('\n')){
   let current='';
   for(const word of paragraph.split(/\s+/)){
    const candidate=current?current+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=width){current=candidate;continue;}
    if(current){result.push(current);current='';}
    for(const character of Array.from(word)){
     if(current&&font.widthOfTextAtSize(current+character,size)>width){result.push(current);current='';}
     current+=character;
    }
   }
   result.push(current);
  }return result.length?result:[''];
 }
 function newPage(){page=doc.addPage([PAGE_WIDTH,PAGE_HEIGHT]);page.drawRectangle({x:0,y:PAGE_HEIGHT-45,width:PAGE_WIDTH,height:45,color:ink});draw("InGamePin",MARGIN,12,16,bold,rgb(1,1,1));draw("CUSTOMER ACTIVITY REPORT",MARGIN+120,17,9,normal,rgb(.8,.9,1));draw(sectionName,545,17,9,normal,rgb(.8,.9,1));y=60;}
 function ensure(height:number){if(y+height>PAGE_HEIGHT-42)newPage();}
 function paragraph(value:unknown,size=9,color=muted){for(const text of wrap(value,WIDTH,size)){ensure(size+6);draw(text,MARGIN,y,size,normal,color);y+=size+5;}y+=4;}
 function section(title:string,newSheet=false){sectionName=title;if(newSheet)newPage();else ensure(65);draw(title,MARGIN,y,18,bold,ink);y+=30;}
 function table(headers:string[],widths:number[],rows:unknown[][]){
  const size=8.5,leading=12,pad=7;
  function head(){ensure(32);page.drawRectangle({x:MARGIN,y:PAGE_HEIGHT-y-27,width:WIDTH,height:27,color:blue});let x=MARGIN;headers.forEach((h,i)=>{draw(h,x+pad,y+7,8.5,bold,rgb(1,1,1));x+=widths[i];});y+=27;}
  head();let rowIndex=0;
  for(const row of rows){
   const cells=row.map((cell,i)=>wrap(cell,widths[i]-2*pad,size));let offset=0;const max=Math.max(...cells.map(c=>c.length));
   while(offset<max){
    const remaining=max-offset;let fits=Math.floor((PAGE_HEIGHT-42-y-2*pad)/leading);
    if(fits<1||(remaining<=30&&remaining>fits)){newPage();head();fits=Math.floor((PAGE_HEIGHT-42-y-2*pad)/leading);}
    const count=Math.min(remaining,fits),height=count*leading+2*pad;
    page.drawRectangle({x:MARGIN,y:PAGE_HEIGHT-y-height,width:WIDTH,height,color:rowIndex%2?pale:rgb(1,1,1),borderColor:line,borderWidth:.4});
    let x=MARGIN;cells.forEach((lines,i)=>{lines.slice(offset,offset+count).forEach((text,j)=>draw(text,x+pad,y+pad+j*leading,size));x+=widths[i];});y+=height;offset+=count;
    if(offset<max){newPage();head();}
   }rowIndex++;
  }y+=14;
 }
 newPage();section("Customer profile");
 paragraph("Complete recorded history | Generated "+date(report.generatedAt)+" | "+zone);
 table(["Account detail","Value","Account detail","Value"],[120,260,120,WIDTH-500],[
  ["Customer name",report.customer.name,"Email",report.customer.email||"Not recorded"],
  ["Customer ID",report.customer.id,"Email verified",report.customer.emailVerified?"Yes":"No"],
  ["Phone",report.customer.phone||"Not recorded","Phone verified",report.customer.phoneVerified?"Yes":"Not verified"],
  ["Registered",date(report.customer.registeredAt),"Last sign-in",date(report.customer.lastSignIn)],
  ["Latest recorded activity",date(report.customer.latestActivity),"Last login country",report.customer.country||"Not recorded"],
  ["Telegram",report.customer.telegram||"Not recorded","Record counts",`${report.orders.length} orders | ${report.transactions.length} wallet entries | ${report.topups.length} top-up requests`],
 ]);
 paragraph("Latest recorded activity uses sign-in, order creation and top-up request times. It is not continuous browsing activity. Contact details are customer-provided unless marked verified.",8);
 section("Wallet summary");
 const s=report.wallet.summary,currency=report.wallet.currency;
 table(["Opening balance","Total credits","Total debits","Closing ledger balance","Current wallet balance"],[150,150,150,160,WIDTH-610],[[summaryMoney(s.opening)+" "+currency,summaryMoney(s.credit)+" "+currency,summaryMoney(s.debit)+" "+currency,summaryMoney(s.closing)+" "+currency,money(report.wallet.balance)]]);
 paragraph("Credits include refunds and adjustments. Opening + credits - debits = closing. Wallet balance last updated: "+date(report.wallet.balanceReadAt)+".",8);
 if(!report.wallet.reconciled)paragraph("The current wallet balance differs from, or cannot be reconciled to, the recorded ledger. Review the wallet history; this report does not assume the balances match.",9,blue);
 paragraph("This report records website activity and delivery status. It does not independently establish payment authorization or voucher redemption. Voucher contents and account passwords are excluded.",8);

 section("IP and login history",true);
 paragraph("All retained records available at report generation. Checkout IPs, website sign-ins, authentication audit events and session snapshots are shown with their sources.");
 if(report.network.status==="setup-required")paragraph("Detailed login IP history is not enabled for this report yet. Existing checkout IPs and country-only login records are shown below; this is not a complete login IP history.",9,blue);
 paragraph("An IP address identifies a network connection, not a person. Authentication service IPs may belong to a website server or proxy. Session snapshots show the last recorded session IP, not every login or IP change. Locations are approximate recorded network locations; browser/device text is supplied by the browser.",8);
 const sources={WEBSITE:"Website sign-in record",AUTH_AUDIT:"Authentication audit",AUTH_SESSION:"Auth session peer snapshot"};
 const ips=new Map<string,Set<string>>();
 const addIp=(ip:string|null,source:string)=>{if(!ip)return;const set=ips.get(ip)||new Set<string>();set.add(source);ips.set(ip,set);};
 report.network.events.forEach(e=>addIp(e.ip_address,sources[e.source]));report.orders.forEach(o=>addIp(o.customer_ip,"Checkout"));
 if(ips.size)paragraph("Unique recorded IP addresses across the available sources: "+ips.size+". See each record below for its source.",8);
 else paragraph("No IP addresses are recorded in the available sources.");
 if(report.network.status==="available"&&!report.network.events.some(e=>e.source!=="AUTH_SESSION"))paragraph("No historical website sign-in IP records or authentication audit events were found. The available session snapshot and checkout records do not establish a complete login IP history.",8,blue);
 if(report.network.countryHistory.length){
  paragraph("Country-only login records: the older login tracker did not save an IP address.",8);
  table(["Login time","Recorded country","IP address"],[240,220,WIDTH-460],report.network.countryHistory.map(e=>[date(e.created_at),e.countryCode,"Not recorded by the older tracker"]));
 }
 if(report.network.events.length){
  paragraph("Retained authentication records",11,ink);
  table(["Date / time","Source / event","Recorded IP","Location","Browser / device"],[110,155,130,110,WIDTH-505],report.network.events.map(e=>[date(e.created_at),sources[e.source]+'\n'+e.event_type+(e.source==='AUTH_SESSION'?'\nNot confirmed as customer IP':''),e.ip_address||"Not recorded",[e.city,e.region,e.country_code].filter(Boolean).join(", ")||"Not recorded",e.user_agent||"Not recorded"]));
 }else if(report.network.status==="available")paragraph("No retained detailed login records were found. Missing or deleted historical records cannot be reconstructed from checkout IPs.",8);
 const checkout=report.orders.filter(o=>o.customer_ip);
 if(checkout.length){
  paragraph("Checkout IP records",11,ink);
  table(["Order created","Order number","Recorded checkout IP","Customer link"],[145,210,185,WIDTH-540],checkout.map(o=>[date(o.created_at),o.order_number,o.customer_ip,o.identityMatch==="guest-email"?"Guest email match (not confirmed account identity)":o.identityMatch==="wallet"?"Wallet-linked order":"Customer account"]));
 }

 const deviceEvents=report.network.events.filter(e=>e.source==="WEBSITE");
 if(deviceEvents.length){
  section("Device and browser history",true);
  paragraph("Device details reported during website sign-ins. Browser IDs identify a website cookie, not a physical device or person. Clearing cookies, cookie expiry, private browsing or another browser can create a different ID.",8);
  paragraph("IMEI, hardware serial numbers and reliable desktop/laptop models are not available to this website. Brand/model may be unavailable or spoofed. Generic iPhone/iPad names are device families, not exact models. These records are supporting clues only.",8);
  if(report.network.deviceStatus==="setup-required")paragraph("Device logging database update is pending. Existing user-agent text can provide approximate details; historical browser IDs cannot be reconstructed.",8,blue);
  table(["Sign-in time / event","Website browser ID","Device / system","Browser","Brand / model"],[140,155,140,135,WIDTH-570],deviceEvents.map(e=>{
   const details=e.device_details||customerDeviceDetails(new Headers({"user-agent":e.user_agent||""}));
   const model=details.model?(details.model+(details.model_source==="client-hint"?" (browser hint)":" (user-agent)")):"Exact model unavailable";
   return [date(e.created_at)+'\n'+e.event_type,e.browser_id||"Not recorded",(details.device_type||"Type unavailable")+'\n'+(details.os||"System unavailable"),details.browser||"Not recorded",(details.brand||"Brand unavailable")+'\n'+model];
  }));
 }else{
  paragraph("Device history: no website sign-in device records are retained for this customer. Browser IDs, IMEI and hardware models cannot be reconstructed from checkout IPs or authentication-server session snapshots.",8);
 }

 section("Wallet transaction history",true);
 paragraph(`${report.transactions.length} entries | All dates: ${zone} | All wallet amounts: ${currency}`);
 if(!report.transactions.length)paragraph("No wallet transactions recorded.");
 else table(["Date / transaction","Activity","Credit","Debit","Before","After","Reference / linked order"],[103,119,57,57,57,57,WIDTH-450],report.transactions.map(t=>{
  const delta=t.balance_before!==null&&t.balance_after!==null?Number(t.balance_after)-Number(t.balance_before):t.transaction_type==='DEBIT'?-Number(t.amount):Number(t.amount);
  const order=report.orders.find(o=>o.id===t.order_id);
  return [date(t.created_at)+'\n'+t.id,t.transaction_type+'\n'+(t.description||''),delta>0?Number(t.amount).toFixed(2):'-',delta<0?Number(t.amount).toFixed(2):'-',t.balance_before===null?'Not recorded':Number(t.balance_before).toFixed(2),t.balance_after===null?'Not recorded':Number(t.balance_after).toFixed(2),[t.reference_id,order?.order_number,t.order_id].filter(Boolean).join('\n')||'-'];
 }));

 section("Wallet top-up requests",true);
 paragraph("All requests are listed, including unpaid or rejected attempts. Only credited requests create a wallet credit.");
 if(!report.topups.length)paragraph("No top-up requests recorded.");
 else table(["Requested","Amount / method","Status","Paid / reviewed","Payment references"],[102,100,77,115,WIDTH-394],report.topups.map(t=>[
  date(t.created_at),money(t.amount,t.currency)+'\n'+t.payment_method,t.status,'Paid: '+date(t.paid_at)+'\nReviewed: '+date(t.reviewed_at),
  'Top-up ID: '+t.id+'\nBill: '+(t.gateway_order_id||'Not recorded')+'\nStored gateway transaction: '+(t.gateway_transaction_id||'Not recorded')+'\n'+(t.payment_method==='PALLY'&&/^\d+(\.\d+)?$/.test(t.payment_reference||'')?'Requested payment (RUB): ':'Submitted reference: ')+(t.payment_reference||'Not recorded'),
 ]));

 section("Orders and purchased products",true);
 const completed=report.orders.filter(o=>o.status==='DELIVERED').length;
 paragraph(`${report.orders.length} recorded orders | ${completed} marked delivered. Unpaid and cancelled orders are included for completeness.`);
 if(!report.orders.length)paragraph("No orders recorded for this account.");
 for(const order of report.orders){
  ensure(110);page.drawRectangle({x:MARGIN,y:PAGE_HEIGHT-y-27,width:WIDTH,height:27,color:pale});draw(order.order_number,MARGIN+8,y+6,11,bold);draw(order.status+' | '+money(order.total,order.currency),MARGIN+440,y+7,10,bold,blue);y+=37;
  paragraph('Order ID: '+order.id+' | Created: '+date(order.created_at)+' | Paid: '+date(order.paid_at)+' | Delivered: '+date(order.delivered_at),8);
  if(order.identityMatch==='guest-email')paragraph('Identity match: guest checkout with the same email; this is not proof that the account holder placed it.',8,blue);
  else if(order.identityMatch==='wallet')paragraph('Identity match: linked through this customer\'s wallet transaction.',8);
  if(!order.items.length)paragraph('No item details recorded.');
  else table(['Product / denomination','Quantity','Unit price','Line total','Delivery / refund records'],[300,50,90,90,WIDTH-530],order.items.map(item=>{
   const denomination=item.option_name||String(item.custom_value??item.denomination??'Standard');
   const link=item.products?.slug?'https://www.ingamepin.com/product/'+encodeURIComponent(item.products.slug):'Product link unavailable';
   const delivery=item.service_delivered_at?'Service marked completed: '+date(item.service_delivered_at):item.deliveredCodes+' / '+item.quantity+' active delivered codes';
   return [item.product_name+'\nOption: '+denomination+(item.product_options?.denomination_currency?' ('+item.product_options.denomination_currency+')':'')+(item.platform?' | '+item.platform:'')+(item.products?.region?' | '+item.products.region:'')+'\n'+link,item.quantity,money(item.unit_price,order.currency),money(item.total_price,order.currency),delivery+(item.refunds.length?'\n'+item.refunds.map(r=>'Refund '+r.status+': '+r.quantity+' units / '+money(r.amount,order.currency)).join('\n'):'')];
  }));
  paragraph('Subtotal: '+money(order.subtotal,order.currency)+' | Discount: '+money(order.discount,order.currency)+' | Order total: '+money(order.total,order.currency),8);
  for(const p of order.payments)paragraph('Payment: '+p.method+' / '+p.status+' / '+money(p.amount,p.currency)+' | Verified: '+date(p.verified_at)+'\nBill: '+(p.gateway_order_id||'Not recorded')+' | Transaction: '+(p.transaction_id||'Not recorded')+' | Stored gateway payment: '+(p.gateway_payment_id||'Not recorded'),8);
  if(!order.payments.length)paragraph('No payment record available for this order.',8);
 }
 if(unsupported)paragraph('Characters outside the embedded font are preserved as [U+XXXX] Unicode notation.',8);
 const pages=doc.getPages();pages.forEach((p,index)=>{page=p;page.drawLine({start:{x:MARGIN,y:29},end:{x:PAGE_WIDTH-MARGIN,y:29},thickness:.5,color:line});draw('Confidential - '+report.customer.id,MARGIN,PAGE_HEIGHT-23,7,normal,muted);draw('Page '+(index+1)+' of '+pages.length,PAGE_WIDTH-100,PAGE_HEIGHT-23,7,normal,muted);});
 return doc.save();
}
