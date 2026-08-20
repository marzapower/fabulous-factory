/**
 * Minimal hand-authored JSX (plan E.2/E.9) — plain html/body/a, no components library.
 * `react-email`'s unified package and `@react-email/components` are deliberately not a
 * dependency (E.1: open bundle-bloat issue, frozen package); `@react-email/render`
 * renders this straight to an html string + a plain-text version.
 */
export interface VerifyEmailProps {
  /** The verification link the recipient must click to confirm their email address. */
  url: string;
}

export function VerifyEmailTemplate({ url }: VerifyEmailProps) {
  return (
    <html>
      <body>
        <p>Welcome! Confirm your email address to finish setting up your account.</p>
        <p>
          <a href={url}>Verify your email</a>
        </p>
        <p>Or paste this link into your browser: {url}</p>
      </body>
    </html>
  );
}
