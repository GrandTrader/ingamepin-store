export const BUSINESS_BUCKET = "business-verification";
export const BUSINESS_FILE_LIMIT = 1024 * 1024;
export const businessDocumentLabels = { registration: "Business registration / tax certificate", address: "Business address proof", ownership: "Ownership declaration" } as const;
export const businessFields = [
  ["legal_name", "Registered business name", 160], ["registration_number", "Registration / tax number", 100],
  ["country", "Country of registration", 100], ["address", "Full registered business address", 600],
  ["contact_name", "Authorized contact name", 120], ["phone", "Phone including country code", 40],
  ["activity", "Business activity and products you buy / resell", 1000],
  ["owners", "Owners and their ownership percentages (include controlling persons)", 2000],
] as const;
export const bankFields = [
  ["beneficiary", "Beneficiary name"], ["account_number", "Account number confirmed by SBI"],
  ["beneficiary_address", "Beneficiary address"], ["bank", "Bank name"],
  ["branch_address", "Branch name and full address"], ["ifsc", "IFSC"], ["swift", "SWIFT / BIC"],
  ["routing_instructions", "SBI-confirmed USD correspondent bank / routing instructions"],
] as const;
export type BusinessApplication = { user_id: string; status: string; details: Record<string,string>; documents: Record<string,string>; revision: number; review_note: string | null; submitted_at: string };
export type BusinessDeposit = { id: string; user_id: string; amount_usd: number; sender_name: string; customer_reference: string; receipt_path: string; status: string; credited_usd: number | null; note: string | null; created_at: string };
export function parseBusinessDetails(form: FormData) {
  const details: Record<string,string> = {};
  for (const [key,label,max] of businessFields) {
    const value=String(form.get(key) ?? "").trim();
    if (value.length<2 || value.length>max) throw Error(`Enter ${label.toLowerCase()} (2–${max} characters).`);
    details[key]=value;
  }
  details.buyer_type=String(form.get("buyer_type") ?? "");
  details.entity_type=String(form.get("entity_type") ?? "");
  if (!["RESELLER","BULK_BUYER","BOTH"].includes(details.buyer_type)) throw Error("Select the business account type.");
  if (!["Sole proprietor","Company","Partnership / LLP","Other registered entity"].includes(details.entity_type)) throw Error("Select the legal entity type.");
  if (form.get("consent")!=="accepted") throw Error("Confirm you are authorized and your business information is accurate.");
  details.consent="business-kyb-v1";
  return details;
}
export async function readBusinessFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size || file.size>BUSINESS_FILE_LIMIT) throw Error("Each document must be a PDF, JPG or PNG up to 1 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const starts=(signature:number[])=>signature.every((v,i)=>bytes[i]===v);
  const format=starts([37,80,68,70,45])?{ext:"pdf",mime:"application/pdf"}:starts([137,80,78,71,13,10,26,10])?{ext:"png",mime:"image/png"}:starts([255,216,255])?{ext:"jpg",mime:"image/jpeg"}:null;
  if(!format || (file.type && file.type!==format.mime)) throw Error("Upload a valid PDF, JPG or PNG document.");
  return {bytes,...format};
}
export function safeBusinessPath(path: string,userId:string) {
  return path.startsWith(userId+"/") && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|jpg|png)$/i.test(path);
}
