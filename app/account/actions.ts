"use server";

import { requirePasswordMfa } from "@/lib/password-mfa";

import { cookies, headers } from "next/headers";
import { isStrongPassword, PASSWORD_RULES } from "@/lib/password-expiry";
import { redirect } from "next/navigation";

import {
  getCountryCode,
  recordCustomerLogin,
} from "@/lib/customer-login-activity";
import { getAuthErrorMessage } from "@/lib/auth-error-message";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/auth-server";

const PENDING_SIGNUP_COOKIE = "ingamepin_pending_signup";
const PENDING_SIGNUP_MAX_AGE = 15 * 60;

function accountRedirect(
  path: string,
  kind: "error" | "success",
  message: string,
): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
}

function verificationRedirect(
  kind: "error" | "success",
  message: string,
  checkout = false,
): never {
  redirect(
    `/account/register?verify=1${checkout ? "&next=/checkout" : ""}&${kind}=${encodeURIComponent(message)}`,
  );
}

async function savePendingSignupEmail(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_SIGNUP_COOKIE, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/account/register",
    maxAge: PENDING_SIGNUP_MAX_AGE,
  });
}

async function getPendingSignupEmail() {
  const cookieStore = await cookies();
  return cookieStore.get(PENDING_SIGNUP_COOKIE)?.value
    .trim()
    .toLowerCase();
}

async function clearPendingSignupEmail() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_SIGNUP_COOKIE);
}

export async function customerLogin(formData: FormData) {
  const business = formData.get("login_area") === "business";
  const checkout = !business && formData.get("next") === "/checkout";
  const loginPath = business ? "/business/login" : checkout ? "/account?next=/checkout" : "/account";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const captchaToken = String(formData.get("captcha_token") ?? "").trim();

  if (!captchaToken) {
    accountRedirect(loginPath, "error", "Complete the security check before signing in.");
  }

  if (!email || password.length < 8) {
    accountRedirect(loginPath, "error", "Enter a valid email and password.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });

  if (result.error || !result.data.user) {
    accountRedirect(
      loginPath,
      "error",
      getAuthErrorMessage(result.error, "login"),
    );
  }

  if (result.data.user) {
    const requestHeaders = await headers();
    await recordCustomerLogin(
      result.data.user.id,
      getCountryCode(requestHeaders),
    );
  }

  redirect(business ? "/business/login" : checkout ? "/checkout" : "/account/dashboard");
}

export async function recordCustomerPasskeyLogin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  const requestHeaders = await headers();
  await recordCustomerLogin(user.id, getCountryCode(requestHeaders));
}

export async function customerRegister(formData: FormData) {
  const checkout = formData.get("next") === "/checkout";
  const registerPath = checkout ? "/account/register?next=/checkout" : "/account/register";
  const verifyRedirect = (kind: "error" | "success", message: string): never => verificationRedirect(kind, message, checkout);
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const countryCode = String(formData.get("country_code") ?? "").trim();
  const localPhone = String(formData.get("phone") ?? "").trim();
  const phone = localPhone ? `${countryCode} ${localPhone}` : "";
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const marketingConsent = formData.get("marketing_consent") === "yes";
  const captchaToken = String(formData.get("captcha_token") ?? "").trim();

  if (!captchaToken) {
    accountRedirect(registerPath,
      "error",
      "Complete the security check before creating your account.",
    );
  }

  if (fullName.length < 2 || fullName.length > 100) {
    accountRedirect(registerPath, "error", "Enter your full name.");
  }

  if (!email || !isStrongPassword(password)) {
    accountRedirect(registerPath,
      "error",
      PASSWORD_RULES,
    );
  }

  if (password !== confirmPassword) {
    accountRedirect(registerPath, "error", "Passwords do not match.");
  }

  const validCountryCode = countryCallingCodes.some(
    ([, callingCode]) => callingCode === countryCode,
  );

  if (
    localPhone &&
    (!validCountryCode || !/^[0-9 ()-]{6,18}$/.test(localPhone))
  ) {
    accountRedirect(registerPath,
      "error",
      "Select a country and enter a valid mobile number.",
    );
  }

  const supabase = await createClient();
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken,
      emailRedirectTo: `https://www.ingamepin.com/account/callback${checkout ? "?next=/checkout" : ""}`,
      data: {
        full_name: fullName,
        phone,
        marketing_email_consent: marketingConsent,
        marketing_email_consented_at: marketingConsent
          ? new Date().toISOString()
          : null,
      },
    },
  });

  if (result.error?.code === "over_email_send_rate_limit") {
    await savePendingSignupEmail(email);
    verifyRedirect(
      "error",
      "Please wait a minute before requesting another verification email.",
    );
  }

  const isExistingAccount =
    result.error?.code === "email_exists" ||
    result.error?.code === "user_already_exists" ||
    (Array.isArray(result.data.user?.identities) &&
      result.data.user.identities.length === 0);

  if (isExistingAccount) {
    accountRedirect(
      checkout ? "/account?next=/checkout" : "/account",
      "error",
      "An account already exists with this email. Sign in or reset your password.",
    );
  }

  if (result.error) {
    accountRedirect(registerPath,
      "error",
      getAuthErrorMessage(result.error, "register"),
    );
  }

  if (result.data.user) {
    const consentResult = await createAdminClient()
      .from("marketing_email_subscriptions")
      .upsert(
        {
          email,
          user_id: result.data.user.id,
          subscribed: marketingConsent,
          consent_source: "registration",
          consented_at: marketingConsent ? new Date().toISOString() : null,
          unsubscribed_at: marketingConsent ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );

    if (consentResult.error) {
      console.error(
        "Unable to save registration marketing consent:",
        consentResult.error.message,
      );
    }
  }

  await savePendingSignupEmail(email);
  verifyRedirect(
    "success",
    "A six-digit verification code has been sent to your email.",
  );
}

export async function customerVerifySignupOtp(formData: FormData) {
  const checkout = formData.get("next") === "/checkout";
  const registerPath = checkout ? "/account/register?next=/checkout" : "/account/register";
  const verifyRedirect = (kind: "error" | "success", message: string): never => verificationRedirect(kind, message, checkout);
  const token = String(formData.get("otp") ?? "").replace(/\D/g, "");
  const email = await getPendingSignupEmail();

  if (!email) {
    accountRedirect(registerPath,
      "error",
      "Your verification session expired. Please register again.",
    );
  }

  if (!/^\d{6}$/.test(token)) {
    verifyRedirect("error", "Enter the complete six-digit code.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (result.error) {
    verifyRedirect(
      "error",
      getAuthErrorMessage(result.error, "verify-signup"),
    );
  }

  await clearPendingSignupEmail();

  if (result.data.user) {
    const requestHeaders = await headers();
    await recordCustomerLogin(
      result.data.user.id,
      getCountryCode(requestHeaders),
    );
  }

  redirect(checkout ? "/checkout" : "/account/dashboard");
}

export async function resendSignupOtp(formData: FormData) {
  const checkout = formData.get("next") === "/checkout";
  const registerPath = checkout ? "/account/register?next=/checkout" : "/account/register";
  const verifyRedirect = (kind: "error" | "success", message: string): never => verificationRedirect(kind, message, checkout);
  const email = await getPendingSignupEmail();
  const captchaToken = String(formData.get("captcha_token") ?? "").trim();

  if (!email) {
    accountRedirect(registerPath,
      "error",
      "Your verification session expired. Please register again.",
    );
  }

  if (!captchaToken) {
    verifyRedirect(
      "error",
      "Complete the security check before requesting another code.",
    );
  }

  const supabase = await createClient();
  const result = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      captchaToken,
      emailRedirectTo: `https://www.ingamepin.com/account/callback${checkout ? "?next=/checkout" : ""}`,
    },
  });

  if (result.error) {
    verifyRedirect(
      "error",
      getAuthErrorMessage(result.error, "resend-signup"),
    );
  }

  await savePendingSignupEmail(email);
  verifyRedirect(
    "success",
    "A new six-digit verification code has been sent.",
  );
}

export async function customerLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/account?success=You have been signed out.");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const captchaToken = String(formData.get("captcha_token") ?? "").trim();

  if (!email) {
    accountRedirect("/account/forgot-password", "error", "Enter your email address.");
  }

  if (!captchaToken) {
    accountRedirect(
      "/account/forgot-password",
      "error",
      "Complete the security check before requesting a reset link.",
    );
  }

  const supabase = await createClient();
  const result = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      "https://www.ingamepin.com/account/callback?next=/account/reset-password",
    captchaToken,
  });

  if (result.error) {
    accountRedirect(
      "/account/forgot-password",
      "error",
      getAuthErrorMessage(result.error, "request-password-reset"),
    );
  }

  accountRedirect(
    "/account/forgot-password",
    "success",
    "If an account exists for this email, a password-reset link has been sent.",
  );
}

export async function updateCustomerPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!isStrongPassword(password)) {
    accountRedirect(
      "/account/reset-password",
      "error",
      PASSWORD_RULES,
    );
  }

  if (password !== confirmPassword) {
    accountRedirect("/account/reset-password", "error", "Passwords do not match.");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) {
    accountRedirect(
      "/account",
      "error",
      getAuthErrorMessage(userError, "update-password"),
    );
  }

  await requirePasswordMfa(supabase, "reset");
  const result = await supabase.auth.updateUser({ password });

  if (result.error) {
    accountRedirect(
      "/account/reset-password",
      "error",
      getAuthErrorMessage(result.error, "update-password"),
    );
  }

  await supabase.auth.signOut();
  accountRedirect("/account", "success", "Password updated. Sign in with your new password.");
}

