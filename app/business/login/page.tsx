import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import PasswordInput from "@/components/PasswordInput";
import RegistrationTurnstile from "@/components/RegistrationTurnstile";
import { customerLogin } from "@/app/account/actions";
import s from "./Login.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "B2B portal login", robots: { index: false, follow: false } };

export default async function BusinessLoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  // The portal checks approval, password setup and authenticator assurance.
  if (user?.email_confirmed_at) redirect("/account/portal");

  return <div className={s.page}>
    <section className={s.card} aria-labelledby="business-login-title">
      <Link href="/" className={s.brand} aria-label="InGamePin home">
        <span className={s.logo}>iP</span>
        <span className={s.wordmark}>iNgame<span>PIN</span></span>
      </Link>
      <h1 id="business-login-title" className={s.title}>B2B portal</h1>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {success && <p role="status" className={s.success}>{success}</p>}
      <form action={customerLogin} className={s.form}>
        <input type="hidden" name="login_area" value="business" />
        <label className={s.label} htmlFor="business-email">Email address
          <input id="business-email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className={s.input} />
        </label>
        <PasswordInput label="Password" name="password" autoComplete="current-password" placeholder="Enter your password" inputClassName={s.password} />
        <RegistrationTurnstile message="Complete the security check to sign in." />
        <AuthSubmitButton label="Login" pendingLabel="Signing in…" className={s.submit} />
      </form>
      <Link className={s.forgot} href="/account/forgot-password">Forgot password?</Link>
      <p className={s.enquiry}>Need a business account? <Link href="/business">Send an enquiry</Link></p>
    </section>
    <Link href="/" className={s.returnLink}>← Return to store</Link>
  </div>;
}
