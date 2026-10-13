type MfaError = { code?: string; status?: number; name?: string };

// Map provider errors without displaying request details, tokens, or setup keys.
export function businessMfaError(error: unknown): string {
  const { code, status, name } = (error && typeof error === "object" ? error : {}) as MfaError;
  if (status === 429 || code === "over_request_rate_limit") {
    return "Too many verification attempts. Please wait a few minutes before trying again.";
  }
  if (status === 401 || ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "no_authorization"].includes(code ?? "")) {
    return "Your sign-in session has expired. Sign in to the B2B portal again, then continue setup.";
  }
  switch (code) {
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
      return "The code does not match this setup. Use the InGamePin entry created from the QR code or setup key currently shown, wait for a new code, and try again. Your phone's date and time must be automatic.";
    case "mfa_factor_not_found":
      return "This authenticator setup is no longer active. Reopen account setup and add the new QR code or key to Google Authenticator.";
    case "mfa_challenge_expired":
      return "The verification request expired. Enter the newest Google Authenticator code and try again.";
    case "mfa_ip_address_mismatch":
      return "Your network connection changed during verification. Stay on the same Wi-Fi or mobile connection and try again with a new code.";
    case "mfa_totp_verify_not_enabled":
    case "mfa_totp_enroll_not_enabled":
      return "Authenticator setup is unavailable on the website. Please contact support.";
  }
  if (name === "AuthRetryableFetchError" || (typeof status === "number" && status >= 500)) {
    return "The verification service could not be reached. Please try again shortly.";
  }
  return "Unable to verify Google Authenticator right now. Please try again or contact support.";
}
