"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getCountryCode,
  recordCustomerLogin,
} from "@/lib/customer-login-activity";
import { createClient } from "@/lib/supabase/server";

function accountRedirect(
  path: string,
  kind: "error" | "success",
  message: string,
): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function customerLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    accountRedirect("/account", "error", "Enter a valid email and password.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    accountRedirect("/account", "error", "Email or password is incorrect.");
  }

  if (result.data.user) {
    const requestHeaders = await headers();
    await recordCustomerLogin(
      result.data.user.id,
      getCountryCode(requestHeaders),
    );
  }

  redirect("/account/dashboard");
}

export async function customerRegister(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (fullName.length < 2 || fullName.length > 100) {
    accountRedirect("/account/register", "error", "Enter your full name.");
  }

  if (!email || password.length < 8) {
    accountRedirect(
      "/account/register",
      "error",
      "Use a valid email and a password with at least 8 characters.",
    );
  }

  if (password !== confirmPassword) {
    accountRedirect("/account/register", "error", "Passwords do not match.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://ingamepin.com/account/callback",
      data: {
        full_name: fullName,
        phone,
      },
    },
  });

  if (result.error) {
    accountRedirect("/account/register", "error", result.error.message);
  }

  accountRedirect(
    "/account",
    "success",
    "Account created. Check your email to verify your account, then sign in.",
  );
}

export async function customerLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/account?success=You have been signed out.");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    accountRedirect("/account/forgot-password", "error", "Enter your email address.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      "https://ingamepin.com/account/callback?next=/account/reset-password",
  });

  if (result.error) {
    accountRedirect("/account/forgot-password", "error", result.error.message);
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

  if (password.length < 8) {
    accountRedirect(
      "/account/reset-password",
      "error",
      "Password must contain at least 8 characters.",
    );
  }

  if (password !== confirmPassword) {
    accountRedirect("/account/reset-password", "error", "Passwords do not match.");
  }

  const supabase = await createClient();
  const result = await supabase.auth.updateUser({ password });

  if (result.error) {
    accountRedirect("/account/reset-password", "error", result.error.message);
  }

  await supabase.auth.signOut();
  accountRedirect("/account", "success", "Password updated. Sign in with your new password.");
}
