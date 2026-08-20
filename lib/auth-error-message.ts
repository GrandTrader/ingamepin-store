type AuthErrorLike = {
  code?: string | null;
  status?: number;
};

export type AuthOperation =
  | "login"
  | "register"
  | "verify-signup"
  | "resend-signup"
  | "request-password-reset"
  | "update-password";

const DEFAULT_MESSAGES: Record<AuthOperation, string> = {
  login: "Email or password is incorrect.",
  register: "We could not create your account. Please try again.",
  "verify-signup": "The verification code is incorrect or expired.",
  "resend-signup": "We could not send another verification code. Please try again.",
  "request-password-reset": "We could not send the password-reset email. Please try again.",
  "update-password": "We could not update your password. Please request a new reset link.",
};

export function getAuthErrorMessage(
  error: AuthErrorLike | null | undefined,
  operation: AuthOperation,
) {
  const code = error?.code?.toLowerCase();

  if (code === "captcha_failed") {
    return "The security check expired or was already used. Complete it again and retry.";
  }

  if (code === "over_email_send_rate_limit") {
    if (operation === "request-password-reset") {
      return "Please wait a minute before requesting another password-reset email.";
    }

    return "Please wait a minute before requesting another verification email.";
  }

  if (code === "over_request_rate_limit" || error?.status === 429) {
    return "Too many attempts were made. Please wait a few minutes and try again.";
  }

  if (operation === "login") {
    if (code === "email_not_confirmed") {
      return "Verify your email address before signing in.";
    }

    return DEFAULT_MESSAGES.login;
  }

  if (operation === "register") {
    if (code === "signup_disabled" || code === "email_provider_disabled") {
      return "Account registration is temporarily unavailable.";
    }

    if (code === "weak_password") {
      return "Choose a stronger password and try again.";
    }

    if (code === "email_address_invalid") {
      return "Enter a valid email address.";
    }

    if (code === "email_address_not_authorized") {
      return "This email address cannot be used for registration.";
    }
  }

  if (operation === "verify-signup" && code === "otp_expired") {
    return "The verification code is incorrect or expired.";
  }

  if (operation === "update-password") {
    if (code === "same_password") {
      return "Choose a password different from your current password.";
    }

    if (code === "weak_password") {
      return "Choose a stronger password and try again.";
    }

    if (
      code === "session_not_found" ||
      code === "session_expired" ||
      code === "refresh_token_not_found"
    ) {
      return "Your password-reset session expired. Request a new reset link.";
    }
  }

  return DEFAULT_MESSAGES[operation];
}
