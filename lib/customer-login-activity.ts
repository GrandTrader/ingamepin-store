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
) {
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
