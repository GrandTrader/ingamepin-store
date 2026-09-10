"use client";
import {useEffect, useRef, useState} from "react";
import {getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode} from "libphonenumber-js/max";
import countries from "i18n-iso-countries";
import english from "i18n-iso-countries/langs/en.json";
import {validateSellerPhone} from "@/lib/seller-phone";
countries.registerLocale(english);
const options = getCountries().sort((a,b)=>(countries.getName(a,"en") ?? a).localeCompare(countries.getName(b,"en") ?? b));
export default function SellerPhoneField({initialPhone, initialCountry, field}: {initialPhone?: string | null; initialCountry?: string | null; field: string}) {
  const parsed = initialPhone ? parsePhoneNumberFromString(initialPhone) : undefined;
  const [country, setCountry] = useState<CountryCode>(parsed?.country ?? (options.includes(initialCountry as CountryCode) ? initialCountry as CountryCode : "IN"));
  const [number,setNumber] = useState(parsed?.nationalNumber?.toString() ?? "");
  const [touched,setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const invalid = Boolean(number && !validateSellerPhone(number,country));
  useEffect(()=>{input.current?.setCustomValidity(invalid ? "Enter a valid mobile number for the selected country, without the country calling code." : "");},[invalid,number,country]);
  return <div className="min-w-0 sm:col-span-2"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
    <label className="min-w-0 text-sm font-bold">Calling code<select name="phone_country" value={country} onChange={event=>{setCountry(event.target.value as CountryCode);setTouched(true);}} className={field}>{options.map(code=><option key={code} value={code}>{countries.getName(code,"en") ?? code} (+{getCountryCallingCode(code)})</option>)}</select></label>
    <label className="min-w-0 text-sm font-bold">Mobile number<input ref={input} name="phone_number" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={24} value={number} onChange={event=>setNumber(event.target.value)} onBlur={()=>setTouched(true)} aria-invalid={touched && invalid} aria-describedby="seller-phone-help" placeholder="Mobile number" className={field} /></label>
  </div><p id="seller-phone-help" className={"mt-2 text-xs " + (touched && invalid ? "text-red-700" : "text-slate-500")}>{touched && invalid ? "Enter a valid mobile number for the selected country, without its calling code." : "Enter your mobile number without the calling code. Used as your contact number. SMS verification is not required."}</p></div>;
}
