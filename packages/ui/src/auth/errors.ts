/**
 * Friendly copy for the Better Auth client's error `code` field, shared by the
 * forgot-password and reset-password forms.
 *
 * Verified against better-auth 1.7.1's `BASE_ERROR_CODES` (`@better-auth/core`'s
 * `dist/error/codes.mjs`) and the `/request-password-reset`/`/reset-password` route
 * implementations (better-auth's `dist/api/routes/password.mjs`): every thrown
 * `APIError` in those routes carries one of these codes.
 */
const AUTH_ERROR_COPY: Record<string, string> = {
  INVALID_TOKEN: "This link is invalid or has expired. Request a new one.",
  PASSWORD_TOO_SHORT: "That password is too short.",
  PASSWORD_TOO_LONG: "That password is too long.",
  USER_NOT_FOUND: "This link is invalid or has expired. Request a new one.",
  SESSION_EXPIRED: "Your session has expired. Sign in again to continue.",
  INVALID_PASSWORD: "That password is incorrect.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account doesn't have a password set.",
  RESET_PASSWORD_DISABLED: "Password reset isn't available for this account.",
};

/** An object shaped like the `error` half of a Better Auth client call's result. */
export interface AuthClientError {
  code?: string | null;
  message?: string | null;
}

/**
 * Resolves a Better Auth client error to user-facing copy: a known `code` wins over the
 * raw `message` (which can be terse or implementation-flavored), falling back to
 * `fallback` when neither is present.
 */
export function describeAuthError(error: AuthClientError, fallback: string): string {
  if (error.code && AUTH_ERROR_COPY[error.code]) {
    return AUTH_ERROR_COPY[error.code];
  }
  return error.message ?? fallback;
}
