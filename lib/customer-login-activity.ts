import { customerBrowserId } from "@/lib/customer-browser-id";
import { customerDeviceDetails } from "@/lib/customer-device-details";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { createAdminClient } from "@/lib/supabase/admin";

export function getCountryCode(headers: Headers) {
  const countryCode = (
    headers.get("x-vercel-ip-country") ??
    headers.get("cf-ipcountry") ??
    ""
  )
    .trim()
    .toUpperCase();

  return /^[A-Z]{2}$/.test(countryCode) &&
    countryCode !== "XX"
    ? countryCode
    : null;
}

export async function recordCustomerLogin(
  userId: string,
  countryCode: string | null,
  requestHeaders?: Headers,
  eventType: "PASSWORD_SIGN_IN" | "EMAIL_VERIFICATION" | "AUTH_CALLBACK" | "SESSION_OBSERVED" = "SESSION_OBSERVED",
) {
  if (requestHeaders && process.env.VERCEL === "1") {
    const cleanHeader = (name: string) => {
      const raw = requestHeaders.get(name); if (!raw) return null;
      let value = raw; try { value = decodeURIComponent(raw); } catch { /* Keep the bounded header text. */ }
      return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || null;
    };
    const edgeCountry = requestHeaders.get("x-vercel-ip-country")?.trim().toUpperCase();
    // Logging failure must not prevent a successful sign-in; no secrets are logged.
    try {
      const baseEvent = {
        user_id: userId, ip_address: trustedClientIp(requestHeaders), country_code: edgeCountry && /^[A-Z]{2}$/.test(edgeCountry) && edgeCountry !== "XX" ? edgeCountry : null,
        region: cleanHeader("x-vercel-ip-country-region"), city: cleanHeader("x-vercel-ip-city"),
        user_agent: requestHeaders.get("user-agent")?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 600) || null,
        event_type: eventType,
      };
      const admin = createAdminClient();
      const browserId = await customerBrowserId();
      let event = await admin.from("customer_login_events").insert({ ...baseEvent, browser_id: browserId, device_details: customerDeviceDetails(requestHeaders) });
      // During a staged rollout, retain IP history if the new columns are not installed yet.
      if (event.error && ["PGRST204", "42703"].includes(event.error.code)) event = await admin.from("customer_login_events").insert(baseEvent);
      if (event.error) console.warn("Customer login history could not be saved.");
    } catch { console.warn("Customer login history could not be saved."); }
  }
  if (!countryCode) {
    return;
  }

  const admin = createAdminClient();
  const existingResult = await admin
    .from("customer_login_activity")
    .select("current_country_code, current_login_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(
      `Unable to read customer login activity: ${existingResult.error.message}`,
    );
  }

  const now = new Date().toISOString();
  const updateResult = await admin
    .from("customer_login_activity")
    .upsert(
      {
        user_id: userId,
        previous_country_code:
          existingResult.data?.current_country_code ?? null,
        previous_login_at:
          existingResult.data?.current_login_at ?? null,
        current_country_code: countryCode,
        current_login_at: now,
        updated_at: now,
      },
      {
        onConflict: "user_id",
      },
    );

  if (updateResult.error) {
    throw new Error(
      `Unable to record customer login activity: ${updateResult.error.message}`,
    );
  }
}
