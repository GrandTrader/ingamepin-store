export type InvoiceBillingDetails = {
  fullName:string; companyName:string; country:string; addressLine1:string; addressLine2:string;
  city:string; state:string; postalCode:string; taxpayerId:string;
};
export function validateInvoiceBilling(input: unknown, business: boolean): InvoiceBillingDetails {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Enter your billing details.");
  const source=input as Record<string,unknown>;
  const read=(key:string,label:string,min:number,max:number)=>{
    const value=typeof source[key]==="string"?source[key].trim():"";
    if(value.length<min || value.length>max || /[\u0000-\u001f\u007f]/.test(value)) throw Error(`Enter ${label} (${min}–${max} characters).`);
    return value;
  };
  const details={fullName:read("fullName","your full legal name",2,150),companyName:read("companyName","your company name",0,150),country:read("country","your country",2,150),addressLine1:read("addressLine1","your building and street address",3,200),addressLine2:read("addressLine2","address line 2",0,200),city:read("city","your city",1,100),state:read("state","your state / province",1,100),postalCode:read("postalCode","your PIN / postal code",1,30),taxpayerId:read("taxpayerId","your tax number",business?1:0,100)};
  if(business && details.country.toLowerCase()==="india" && !/^[1-9][0-9]{5}$/.test(details.postalCode)) throw Error("Enter a valid six-digit Indian PIN code.");
  if(business && !/^[a-zA-Z0-9][a-zA-Z0-9 -]{0,29}$/.test(details.postalCode)) throw Error("Enter a valid PIN / postal code.");
  return details;
}
