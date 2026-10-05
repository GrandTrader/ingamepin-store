import { countryCallingCodes } from "./countryCallingCodes";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
export const BUSINESS_BUCKET = "business-verification";
export const BUSINESS_FILE_LIMIT = 1024 * 1024;
export const businessDocumentLabels = { registration: "Business registration / tax certificate", address: "Registered business address proof", ownership: "Ownership declaration", identity: "Representative's photo ID (KYC)", personal_address: "Representative's address proof (KYC)" } as const;
export const businessDocumentGroups = [
  { title: "Personal verification (KYC)", keys: ["identity", "personal_address"] },
  { title: "Business verification (KYB)", keys: ["registration", "address", "ownership"] },
] as const;
export const purchasingPurposes = [
  ["RESELLER", "Resale to customers", "For retailers, online stores and distributors."],
  ["BULK_BUYER", "Business use, rewards or gifting", "For your organization, employees or clients."],
  ["BOTH", "Resale and business use", "For a combination of these purchasing needs."],
] as const;
export const identityDocumentTypes = ["Passport", "National identity card", "Driving licence"] as const;
export const representativeRoles = ["Owner / proprietor", "Director / partner", "Authorized representative"] as const;
export const businessDetailLabels: Record<string,string> = {interest:"Interested in",website:"Website",monthly_volume:"Estimated monthly purchases",onboarding_method:"Contact method",verification_method:"Verification method",email:"Account email",legal_name:"Business name",activity:"Requirements",buyer_type:"Purpose of purchasing",entity_type:"Legal entity type",contact_name:"Authorized representative",phone:"Phone number",phone_country:"Phone country / territory",phone_country_code:"Dialling code",phone_number:"National phone number",country:"Country of registration",address:"Registered business address",address_line1:"Address line 1",address_line2:"Address line 2",city:"City / town",state:"State / province / region",postal_code:"PIN / postal code",postal_code_not_applicable:"Address has no postal code",identity_document_type:"KYC identity document type",representative_role:"Representative's role",verification_scope:"Verification scope"};
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
export type BusinessDeposit = { id: string; user_id: string; amount_usd: number; sender_name: string; customer_reference: string; receipt_path: string; status: string; credited_usd: number | null; note: string | null; created_at: string; invoice_id?: string | null };
export function parseBusinessDetails(form: FormData) {
  const details: Record<string,string> = {};
  const read=(key:string,label:string,max:number,min=2)=>{const value=String(form.get(key)??"").trim();if(value.length<min||value.length>max)throw Error(`Enter ${label.toLowerCase()} (${min}–${max} characters).`);return value;};
  for (const [key,label,max] of businessFields) {
    if (["address","country","phone"].includes(key)) continue;
    details[key]=read(key,label,max);
  }
  details.buyer_type=String(form.get("buyer_type")??"");
  details.entity_type=String(form.get("entity_type")??"");
  if (!purchasingPurposes.some(([value])=>value===details.buyer_type)) throw Error("Select your purpose of purchasing.");
  if (!["Sole proprietor","Company","Partnership / LLP","Other registered entity"].includes(details.entity_type)) throw Error("Select the legal entity type.");
  details.country=read("country","country of registration",100);
  if(!countryCallingCodes.some(([name])=>name===details.country))throw Error("Select a country of registration from the search suggestions.");
  details.address_line1=read("address_line1","address line 1",150,3);
  details.address_line2=read("address_line2","address line 2",150,0);
  details.city=read("city","city / town",80,1);
  details.state=read("state","state / province / region",80,details.country==="India"?2:0);
  const noPostal=form.get("postal_code_not_applicable")==="yes";
  details.postal_code=noPostal?"":read("postal_code","PIN / postal code",16,2);
  if(details.country==="India"&&(noPostal||!/^[1-9][0-9]{5}$/.test(details.postal_code)))throw Error("Enter a valid six-digit Indian PIN code.");
  if(!noPostal&&!/^[a-zA-Z0-9][a-zA-Z0-9 -]{1,15}$/.test(details.postal_code))throw Error("Enter a valid PIN / postal code.");
  details.postal_code_not_applicable=noPostal?"yes":"no";
  details.address=[details.address_line1,details.address_line2,details.city,details.state,details.postal_code,details.country].filter(Boolean).join("\n");
  details.phone_country=read("phone_country","phone country / territory",100);
  const dial=countryCallingCodes.find(([name])=>name===details.phone_country)?.[1];
  if(!dial)throw Error("Select the phone country code.");
  const national=read("phone_number","phone number",24,4);
  if(!/^[0-9 ()-]+$/.test(national))throw Error("Enter a national phone number without the country code.");
  const phone=parsePhoneNumberFromString(dial+national.replace(/[^0-9]/g,""));
  if(!phone?.isValid()||!phone.number.startsWith(dial))throw Error("Enter a valid phone number for the selected country code.");
  details.phone=phone.number;details.phone_country_code=dial;details.phone_number=national;
  details.identity_document_type=String(form.get("identity_document_type")??"");
  details.representative_role=String(form.get("representative_role")??"");
  if(!identityDocumentTypes.some(v=>v===details.identity_document_type))throw Error("Select your KYC identity document type.");
  if(!representativeRoles.some(v=>v===details.representative_role))throw Error("Select the representative's role in the business.");
  if (form.get("consent")!=="accepted") throw Error("Confirm you are authorized and your business information is accurate.");
  details.consent="business-kyb-v1";
  details.verification_scope="KYC_AND_KYB";
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
