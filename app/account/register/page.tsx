import { cookies } from "next/headers";
import Link from "next/link";

import OtpVerificationForm from "@/components/OtpVerificationForm";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import PasswordInput from "@/components/PasswordInput";
import RegistrationTurnstile from "@/components/RegistrationTurnstile";
import { countryCallingCodes } from "@/lib/countryCallingCodes";

import { customerRegister } from "../actions";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    verify?: string;
  }>;
};

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "your registered email";

  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? ""}*`
      : `${localPart.slice(0, 2)}${"*".repeat(
          Math.min(Math.max(localPart.length - 2, 2), 6),
        )}`;

  return `${visibleLocal}@${domain}`;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error, success, verify } = await searchParams;
  const cookieStore = await cookies();
  const pendingEmail = cookieStore.get("ingamepin_pending_signup")?.value;
  const showVerification = verify === "1" && Boolean(pendingEmail);

  return (
    <main className="bg-slate-100 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        {showVerification ? (
          <section className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cyan-100 text-3xl text-cyan-700">
              ✉
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
              Email verification
            </p>
            <h1 className="mt-2 text-3xl font-black">Enter your OTP</h1>
            <p className="mx-auto mt-3 max-w-md leading-7 text-slate-600">
              We sent a six-digit verification code to{" "}
              <strong className="text-slate-950">
                {maskEmail(pendingEmail ?? "")}
              </strong>
              .
            </p>

            {error && (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {success}
              </p>
            )}

            <OtpVerificationForm />

            <p className="mt-5 text-xs leading-5 text-slate-500">
              The code expires for security. Never share it with anyone,
              including support.
            </p>
            <Link
              href="/account/register"
              className="mt-5 inline-flex text-sm font-bold text-cyan-700 hover:text-cyan-600"
            >
              Use a different email address
            </Link>
          </section>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
              InGamePin customer
            </p>
            <h1 className="mt-2 text-3xl font-black">Create account</h1>
            <p className="mt-2 text-slate-500">
              Create one secure account for orders, codes and wallet access.
            </p>
            {error && (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <form
              action={customerRegister}
              className="mt-7 grid gap-5 sm:grid-cols-2"
            >
              <label className="block text-sm font-bold sm:col-span-2">
                Full name
                <input
                  name="full_name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </label>
              <label className="block text-sm font-bold sm:col-span-2">
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-bold">Mobile number</legend>
                <div className="mt-2 grid grid-cols-[minmax(130px,0.8fr)_minmax(0,1.2fr)] gap-3">
                  <label className="sr-only" htmlFor="registration-country-code">
                    Country code
                  </label>
                  <select
                    id="registration-country-code"
                    name="country_code"
                    defaultValue="+91"
                    aria-label="Country calling code"
                    className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-cyan-500"
                  >
                    {countryCallingCodes.map(([country, code]) => (
                      <option key={`${country}-${code}`} value={code}>
                        {country} ({code})
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="registration-phone">
                    Phone number
                  </label>
                  <input
                    id="registration-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    className="min-w-0 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
                  />
                </div>
              </fieldset>
              <PasswordInput
                label="Password"
                name="password"
                autoComplete="new-password"
              />
              <PasswordInput
                label="Confirm password"
                name="confirm_password"
                autoComplete="new-password"
              />
              <RegistrationTurnstile />
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  name="marketing_consent"
                  value="yes"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span>
                  Email me about product restocks, promotions and special offers.
                  I can unsubscribe at any time.
                </span>
              </label>
              <AuthSubmitButton
                label="Create account"
                pendingLabel="Creating account..."
                className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
              />
            </form>
            <p className="mt-6 text-center text-sm text-slate-500">
              Already registered?{" "}
              <Link className="font-bold text-cyan-600" href="/account">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
