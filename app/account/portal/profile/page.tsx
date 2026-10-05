import CustomerAccountShell from "../../CustomerAccountShell";
import { portalCustomer } from "@/lib/business-portal-data";
import BusinessProfileFields from "@/app/admin/business-verification/BusinessProfileFields";
import BusinessActionForm from "@/components/BusinessActionForm";
import { businessProfileSections, canCompleteBusinessField } from "@/lib/admin-business-profile";
import { completeBusinessProfile } from "./actions";
export const dynamic="force-dynamic";
export default async function PortalProfilePage() {
  const {application, email} = await portalCustomer();
  const hasBlanks = businessProfileSections.some(s => s.fields.some(f => canCompleteBusinessField(application.details, f.key)));
  return <CustomerAccountShell displayName={application.details.contact_name || application.details.legal_name}>
    <h1 className="text-2xl font-black">Business profile</h1>
    <p className="mt-2 break-all text-sm text-slate-600">Account email (locked): {email}</p>
    <section className="mt-5 rounded-xl border bg-white p-4 sm:p-5">
      {hasBlanks ? <BusinessActionForm key={application.revision} action={completeBusinessProfile} button="Save and lock new details"><BusinessProfileFields details={application.details} completion/></BusinessActionForm> : <BusinessProfileFields details={application.details} completion/>}
    </section>
  </CustomerAccountShell>;
}
