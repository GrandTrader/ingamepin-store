import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Called only after a successful checkout. A submitted email is not ownership proof.
export async function saveCheckoutConsent(user: User | null, email: string, consent: unknown) {
  if (consent !== true || !user?.email_confirmed_at || user.email?.trim().toLowerCase() !== email) return;
  try {
    const admin = createAdminClient();
    const result = await admin.from("marketing_email_subscriptions").upsert({
      email, user_id: user.id, subscribed: true, consent_source: "verified_checkout",
      consented_at: new Date().toISOString(), unsubscribed_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (result.error) throw Error("Consent could not be saved.");
    await admin.auth.admin.updateUserById(user.id, { user_metadata: {
      ...user.user_metadata, marketing_email_consent: true, marketing_email_consented_at: new Date().toISOString(),
    } });
  } catch { console.error("Unable to save verified checkout marketing consent."); }
}
