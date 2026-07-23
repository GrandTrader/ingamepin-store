"use server";

import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export async function adminLogin(
  formData: FormData
) {
  const email = String(
    formData.get("email") ?? ""
  ).trim();

  const password = String(
    formData.get("password") ?? ""
  );

  if (!email || !password) {
    redirect(
      "/admin/login?error=Email and password are required"
    );
  }

  const supabase = await createClient();

  const loginResult =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (loginResult.error || !loginResult.data.user) {
    redirect(
      `/admin/login?error=${encodeURIComponent(
        "Incorrect email or password"
      )}`
    );
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", loginResult.data.user.id)
    .maybeSingle();

  if (adminResult.error || !adminResult.data) {
    await supabase.auth.signOut();

    redirect(
      `/admin/login?error=${encodeURIComponent(
        "This account does not have administrator access"
      )}`
    );
  }

  redirect("/admin");
}

export async function adminLogout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/admin/login");
}

export async function sendTestEmail(
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const recipient = String(
    formData.get("recipient") ?? ""
  ).trim();

  try {
    await sendEmail({
      to: recipient,
      subject: "InGamePin email connection successful",
      text: "Your InGamePin website is successfully connected to Hostinger Email.",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
          <div style="background:#06b6d4;border-radius:14px;padding:18px 22px;font-size:24px;font-weight:800">
            InGamePin
          </div>
          <h1 style="font-size:26px;margin:28px 0 12px">Email connection successful</h1>
          <p style="font-size:16px;line-height:1.7;color:#475569">
            Your InGamePin website is successfully connected to Hostinger Email.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#64748b">
            Future customer order notifications and digital delivery emails will use this secure connection.
          </p>
        </div>
      `,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to send the test email.";

    redirect(
      `/admin?emailError=${encodeURIComponent(message)}`
    );
  }

  redirect("/admin?emailSuccess=Test email sent successfully");
}
