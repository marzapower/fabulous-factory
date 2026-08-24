/**
 * Minimal hand-authored JSX (plan E.2/E.9) — plain html/body/a, no components library.
 * See `verify-email.tsx` for why `react-email`/`@react-email/components` aren't a dep.
 */
export interface DeleteAccountProps {
  /** The one-time link the recipient must click to confirm permanent account deletion. */
  url: string;
}

export function DeleteAccountTemplate({ url }: DeleteAccountProps) {
  return (
    <html>
      <body>
        <p>We received a request to permanently delete your account.</p>
        <p>
          <a href={url}>Confirm account deletion</a>
        </p>
        <p>Or paste this link into your browser: {url}</p>
        <p>
          If you didn't request this, someone may have access to your account — sign in and change
          your password right away.
        </p>
      </body>
    </html>
  );
}
