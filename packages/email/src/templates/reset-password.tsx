/**
 * Minimal hand-authored JSX (plan E.2/E.9) — plain html/body/a, no components library.
 * See `verify-email.tsx` for why `react-email`/`@react-email/components` aren't a dep.
 */
export interface ResetPasswordProps {
  /** The one-time link the recipient must click to set a new password. */
  url: string;
}

export function ResetPasswordTemplate({ url }: ResetPasswordProps) {
  return (
    <html>
      <body>
        <p>We received a request to reset your password.</p>
        <p>
          <a href={url}>Reset your password</a>
        </p>
        <p>Or paste this link into your browser: {url}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </body>
    </html>
  );
}
