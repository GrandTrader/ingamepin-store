import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { businessSecurity } from "@/lib/business-security";

export async function sendBusinessSetupEmail(adminId: string, customer: { userId?: string; email?: string }) {
  const db = createAdminClient();
  const claim = await db.rpc("claim_business_setup_email", { p_admin: adminId, p_user: customer.userId ?? null, p_email: customer.email ?? null });
  if (claim.error || !claim.data?.email || !claim.data?.user_id) throw Error(claim.error?.code === "P0001" ? claim.error.message : "Unable to prepare the setup email. Check the business security database update.");
  const state = await businessSecurity(claim.data.user_id);
  if (state.password_ready && state.totp_ready) return "Account setup is already complete. The customer can sign in through the B2B link.";
  const result = await db.auth.admin.generateLink({ type: "recovery", email: claim.data.email });
  if (result.error || !result.data?.properties?.hashed_token) throw Error("Unable to generate a secure setup link. Use Resend setup email to try again.");
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.ingamepin.com");
  if (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw Error("A secure website URL must be configured.");
  const url = new URL("/account/business/setup/confirm", origin.origin);
  // A fragment keeps the recovery token out of server URLs and referrer headers.
  url.hash = new URLSearchParams({ token_hash: result.data.properties.hashed_token }).toString();
  const text = `Your InGamePin B2B account has been approved.\n\nCreate your password and set up Google Authenticator using this secure link:\n${url.href}\n\nAfter setup, enter the business portal through the B2B link on our website or from your profile. You will need a Google Authenticator code when signing in to the portal.\n\nIf the link has expired, contact support for a new setup email. Never share your password, setup key, or verification codes.\n\nInGamePin Team`;
  const escaped = url.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const delivery = await sendEmail({ to: claim.data.email, subject: "Set up your InGamePin B2B account", text,
    html: `<p>Your InGamePin B2B account has been approved.</p><p>Create your password, then connect <strong>Google Authenticator</strong> to enable mandatory two-step verification.</p><p><a href="${escaped}">Set up your B2B account</a></p><p>After setup, use the B2B link on our website or open the business portal from your profile.</p><p>If this link has expired, contact support for a new setup email. Never share your password, setup key, or verification codes.</p><p>InGamePin Team</p>` });
  if (delivery.rejected?.length) throw Error("The email server rejected delivery. Check the address and resend the setup email.");
  return "Setup email sent. The customer must create a password and connect Google Authenticator before entering the B2B portal.";
}
