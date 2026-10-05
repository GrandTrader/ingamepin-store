"use client";
import BusinessActionForm from "@/components/BusinessActionForm";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { businessInterests } from "@/lib/business-interest";
import { submitBusinessApplication } from "./actions";
import s from "./BusinessVerificationForm.module.css";

export default function BusinessInterestForm({ details = {}, email, name }: { details?: Record<string,string>; email: string; name: string }) {
  return <div className={s.form}><BusinessActionForm action={submitBusinessApplication} button="Submit interest">
    <section className={s.section}>
      <div className={s.heading}><div><h2>Work with InGamePin</h2><p>Tell us what you need. Verification will be completed by email before an admin activates your B2B account.</p></div></div>
      <div className={s.grid}>
        <label className={s.field}>Contact name *<input name="contact_name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={details.contact_name || name}/></label>
        <label className={s.field}>Account email<input type="email" value={email} readOnly/><small>We will contact you at this email address.</small></label>
        <label className={s.field}>Business / store name *<input name="legal_name" required minLength={2} maxLength={160} autoComplete="organization" defaultValue={details.legal_name}/></label>
        <label className={s.field}>Country *<select name="country" required defaultValue={details.country || ""}><option value="" disabled>Select country</option>{countryCallingCodes.map(([country])=><option key={country}>{country}</option>)}</select></label>
        <label className={s.field}>Interested in *<select name="interest" required defaultValue={details.interest || ""}><option value="" disabled>Select interest</option>{businessInterests.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className={s.field}>Website (optional)<input name="website" type="url" maxLength={300} placeholder="https://" defaultValue={details.website}/></label>
        <label className={s.field}>Phone / WhatsApp (optional)<input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={details.phone}/></label>
        <label className={s.field}>Estimated monthly purchases *<input name="monthly_volume" required minLength={1} maxLength={100} aria-describedby="monthly-volume-help" placeholder="For example, USD 5,000" defaultValue={details.monthly_volume}/><small id="monthly-volume-help">Enter the approximate amount you expect to spend each month, including the currency.</small></label>
        <label className={`${s.field} ${s.full}`}>Your requirements *<textarea name="activity" rows={3} required minLength={10} maxLength={2000} placeholder="Products, regions, and how you plan to use our B2B portal or API." defaultValue={details.activity}/></label>
      </div>
    </section>
    <label className={s.check}><input name="consent" type="checkbox" value="accepted" required/>I confirm these details are accurate and agree to be contacted about my business request.</label>
  </BusinessActionForm></div>;
}
