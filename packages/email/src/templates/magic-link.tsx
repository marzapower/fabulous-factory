/**
 * Minimal hand-authored JSX (plan E.2/E.9) — plain html/body/a, no components library.
 * See `verify-email.tsx` for why `react-email`/`@react-email/components` aren't a dep.
 */
export interface MagicLinkProps {
  /** The one-time sign-in link the recipient must click to establish a session. */
  url: string;
}

export function MagicLinkTemplate({ url }: MagicLinkProps) {
  return (
    <html>
      <body>
        <p>Use the link below to sign in. It expires shortly and can only be used once.</p>
        <p>
          <a href={url}>Sign in</a>
        </p>
        <p>Or paste this link into your browser: {url}</p>
      </body>
    </html>
  );
}
