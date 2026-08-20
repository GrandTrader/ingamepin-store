"use client";

import {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  customerVerifySignupOtp,
  resendSignupOtp,
} from "@/app/account/actions";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import RegistrationTurnstile from "@/components/RegistrationTurnstile";

const OTP_LENGTH = 6;

export default function OtpVerificationForm() {
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: OTP_LENGTH }, () => ""),
  );
  const [resendSeconds, setResendSeconds] = useState(60);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedCode = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (!pastedCode) return;

    event.preventDefault();
    const next = Array.from(
      { length: OTP_LENGTH },
      (_, index) => pastedCode[index] ?? "",
    );
    setDigits(next);
    inputRefs.current[Math.min(pastedCode.length, OTP_LENGTH) - 1]?.focus();
  }

  function validateSubmission(event: FormEvent<HTMLFormElement>) {
    if (digits.join("").length !== OTP_LENGTH) {
      event.preventDefault();
      inputRefs.current[digits.findIndex((digit) => !digit)]?.focus();
    }
  }

  return (
    <>
      <form
        action={customerVerifySignupOtp}
        className="mt-7"
        onSubmit={validateSubmission}
      >
        <input type="hidden" name="otp" value={digits.join("")} />
        <div className="grid grid-cols-6 gap-2 sm:gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Verification code digit ${index + 1}`}
              maxLength={1}
              className="h-14 min-w-0 rounded-xl border-2 border-slate-200 bg-slate-50 text-center text-2xl font-black text-slate-950 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100 sm:h-16"
            />
          ))}
        </div>
        <AuthSubmitButton
          label="Verify & Activate Account"
          pendingLabel="Verifying code..."
          className="mt-6 w-full rounded-xl bg-cyan-500 px-5 py-3.5 font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </form>

      <form
        action={resendSignupOtp}
        className="mt-4"
        onSubmit={() => setResendSeconds(60)}
      >
        {resendSeconds === 0 && (
          <RegistrationTurnstile message="Complete the security check to request another code." />
        )}
        <AuthSubmitButton
          label={
            resendSeconds > 0
              ? `Resend code in ${resendSeconds}s`
              : "Resend verification code"
          }
          pendingLabel="Sending verification code..."
          disabled={resendSeconds > 0}
          className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        />
      </form>
    </>
  );
}
