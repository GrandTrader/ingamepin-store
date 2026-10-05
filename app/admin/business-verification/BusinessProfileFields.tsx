import { businessProfileSections, canCompleteBusinessField } from "@/lib/admin-business-profile";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { businessInterests } from "@/lib/business-interest";
const input = "mt-1 block w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm font-normal";

export default function BusinessProfileFields({details = {}, completion = false}: {details?: Record<string, string>; completion?: boolean}) {
  return <div className="space-y-5">
    <p className="text-xs text-slate-500">{completion ? "Fill only empty fields. Once saved, your entries are locked. Contact support to correct existing information." : "Fields marked * are required. Leave unknown optional details blank. Company registration and tax / VAT numbers are separate."}</p>
    {!completion && <label className="block text-sm font-semibold">Customer account email *<input className={input} name="email" type="email" required maxLength={254}/></label>}
    {completion && details.address && !details.address_line1 && <p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm">Registered address (locked): {details.address}</p>}
    {businessProfileSections.map(section => <section key={section.title} className="min-w-0 border-t pt-4">
      <h3 className="mb-3 text-sm font-bold">{section.title}</h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {section.fields.map(field => {
          const type = "type" in field ? field.type : "text";
          const required = !completion && "required" in field && field.required;
          const locked = completion && !canCompleteBusinessField(details, field.key);
          return <label key={field.key} className={`min-w-0 text-sm font-semibold ${type === "textarea" ? "sm:col-span-2" : ""}`}>{field.label}{required ? " *" : ""}
            {locked ? <span className="mt-1 block min-h-9 whitespace-pre-wrap break-words rounded-lg border bg-slate-100 px-3 py-2 text-sm font-normal text-slate-600">{details[field.key] || "See registered address"}<span className="ml-2 text-xs text-slate-500">(Locked)</span></span> : type === "country" ? <select className={input} name={field.key} required={required} defaultValue=""><option value="">Select country</option>{countryCallingCodes.map(([name]) => <option key={name}>{name}</option>)}</select>
              : type === "interest" ? <select className={input} name={field.key} required={required} defaultValue=""><option value="">Select access</option>{businessInterests.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              : type === "textarea" ? <textarea className={input} name={field.key} maxLength={field.max} rows={2}/>
              : <input className={input} name={field.key} type={type} required={required} minLength={required ? 2 : undefined} maxLength={field.max} placeholder={field.key === "monthly_volume" ? "e.g. USD 5,000" : field.key === "phone" ? "+44 …" : undefined}/>}
          </label>;
        })}
      </div>
    </section>)}
  </div>;
}
