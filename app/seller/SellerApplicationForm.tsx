"use client";

import { useActionState, useState } from "react";
import countries from "i18n-iso-countries";
import english from "i18n-iso-countries/langs/en.json";
import { SELLER_DECLARATION, type SellerApplication } from "@/lib/seller-application";
import SellerPhoneField from "./SellerPhoneField";
import { submitSellerApplication } from "./actions";

countries.registerLocale(english);
const countryOptions = Object.entries(countries.getNames("en")).sort((a, b) => a[1].localeCompare(b[1]));
const field = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
export default function SellerApplicationForm({ application }: { application: SellerApplication | null }) {
  const [marketplace, setMarketplace] = useState(application ? application.sells_on_other_marketplaces ? "YES" : "NO" : "");
  const [state, action, pending] = useActionState(submitSellerApplication, { error: "" });
  return <form action={action} className="space-y-6">
    <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">Seller username<input name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" defaultValue={application?.username ?? ""} autoComplete="off" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Shown below your product images. Letters, numbers and underscores only.</span></label>
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2">
        <label className="min-w-0 text-sm font-bold">Name<input name="first_name" required maxLength={75} defaultValue={application?.first_name ?? ""} autoComplete="given-name" className={field} /></label>
        <label className="min-w-0 text-sm font-bold">Surname<input name="surname" required maxLength={75} defaultValue={application?.surname ?? ""} autoComplete="family-name" className={field} /></label>
        </div>
        <label className="text-sm font-bold">Country<select name="country_code" required defaultValue={application?.country_code ?? ""} autoComplete="country" className={field}><option value="" disabled>Select your country</option>{countryOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <SellerPhoneField initialPhone={application?.phone_number} initialCountry={application?.country_code} field={field} />
      </div>
      <section className="space-y-4"><h2 className="font-black">Full address</h2>
        <label className="block text-sm font-bold">Address line 1<input name="address_line1" required maxLength={200} defaultValue={application?.address_line1 ?? ""} autoComplete="address-line1" placeholder="House / flat number and street" className={field} /></label>
        <label className="block text-sm font-bold">Address line 2 (optional)<input name="address_line2" maxLength={200} defaultValue={application?.address_line2 ?? ""} autoComplete="address-line2" placeholder="Area, locality or landmark" className={field} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">City / town<input name="city" required maxLength={100} defaultValue={application?.city ?? ""} autoComplete="address-level2" className={field} /></label>
          <label className="text-sm font-bold">District (optional)<input name="district" maxLength={100} defaultValue={application?.district ?? ""} className={field} /></label>
          <label className="text-sm font-bold">State / province / region<input name="state_region" required maxLength={100} defaultValue={application?.state_region ?? ""} autoComplete="address-level1" className={field} /></label>
          <label className="text-sm font-bold">PIN / postal code<input name="postal_code" maxLength={20} defaultValue={application?.postal_code ?? ""} autoComplete="postal-code" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Enter manually. Required for India; leave blank if your country has no postal codes.</span></label>
        </div>
      </section>
      <label className="block text-sm font-bold">Do you already sell on another marketplace?<select name="marketplace" required value={marketplace} onChange={event => setMarketplace(event.target.value)} className={field}><option value="" disabled>Select an answer</option><option value="NO">No</option><option value="YES">Yes</option></select></label>
      {marketplace === "YES" && <label className="block text-sm font-bold">Upload marketplace proof<input name="marketplace_proof" type="file" required accept="application/pdf,image/jpeg,image/png" className={field} /><span className="mt-2 block text-xs font-normal text-slate-500">Upload an account statement or screenshot showing your seller name and marketplace. PDF, JPG or PNG, up to 5 MB. Only administrators can access this proof. Hide unrelated customer and payment details.</span></label>}
      <p className="text-xs text-slate-500">When you submit, we record the connection IP address for security and application review. It is not shown on your public seller profile.</p>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><h2 className="font-black">Seller declaration</h2><p className="mt-3 text-sm leading-6 text-slate-700">{SELLER_DECLARATION}</p><label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-bold"><input name="declaration" value="accepted" type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0" />I have read and agree to this declaration.</label></div>
    </fieldset>
    {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{state.error}</p>}
    <button disabled={pending} className="min-h-12 w-full rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50 sm:w-auto">{pending ? "Submitting…" : application ? "Resubmit application" : "Submit seller application"}</button>
  </form>;
}
