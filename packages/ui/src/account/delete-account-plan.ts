/**
 * Which account-deletion path applies, derived from two server-verified facts —
 * never guessed client-side, same discipline as `LoginFormProps.enabledProviders`.
 *
 * Verified against better-auth 1.7.1's `/delete-user` endpoint (better-auth's
 * `dist/api/routes/update-user.mjs`, and packages/auth/src/auth.ts's own config comment):
 * - When `user.deleteUser.sendDeleteAccountVerification` is configured (our auth.ts
 *   installs it exactly when email is live), the endpoint ALWAYS ends by emailing a
 *   confirmation link and returning `{ success: true }` WITHOUT deleting — even when a
 *   `password` was supplied and verified (the password check at :299 doesn't short-circuit
 *   past the verification branch at :317). So with email enabled, a successful request
 *   can only ever mean "confirmation email sent", never "account gone" — a UI that
 *   pretends otherwise silently no-ops a destructive action (security review finding).
 * - Without that callback (email disabled): a verified `password` deletes immediately;
 *   no password falls back to a session freshness check (`sessionConfig.freshAge`) and
 *   deletes immediately if fresh, else throws `SESSION_EXPIRED`.
 *
 * The two axes are therefore independent: whether to collect the password (a
 * server-verified strengthening whenever a credential account exists), and what a
 * success actually means (email round-trip vs. immediate deletion).
 */
export interface DeleteAccountPlan {
  /** Collect the user's password and send it — better-auth verifies it before doing
   * anything, on both the email and the immediate path. */
  collectPassword: boolean;
  /** What a successful request means: `"email"` → a confirmation link was sent and the
   * account stays active until it's clicked; `"immediate"` → the account is gone now. */
  confirmation: "email" | "immediate";
}

export function resolveDeleteAccountPlan(params: {
  hasPasswordAccount: boolean;
  emailEnabled: boolean;
}): DeleteAccountPlan {
  return {
    collectPassword: params.hasPasswordAccount,
    confirmation: params.emailEnabled ? "email" : "immediate",
  };
}
