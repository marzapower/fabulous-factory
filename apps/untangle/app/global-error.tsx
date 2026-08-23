"use client";

/**
 * Root-layout error boundary (Next 16 `global-error.tsx` contract): only rendered when
 * the ROOT layout itself throws, which means it replaces that layout — it must render
 * its own <html>/<body> and cannot assume anything the layout would otherwise supply.
 * Concretely: no `./globals.css` (that import lives in `app/layout.tsx`, which this file
 * bypasses, so Tailwind's compiled output and the shared `@factory/ui` tokens are not
 * guaranteed to be loaded), no vendored IBM Plex fonts (also wired up in the layout), and
 * no `@factory/ui/feedback` (`FeedbackShell` is built on primitives that assume those
 * tokens exist). Inline styles + the system font stack keep this last-resort route
 * rendering correctly even when the rest of the app's styling pipeline never ran.
 *
 * Dark mode: with none of the app's own CSS loaded, this can't reach for Tailwind's
 * `dark:` variant or `@factory/ui`'s tokens either — so it defines its own tiny,
 * dependency-free palette as CSS custom properties in a plain `<style>` tag, switched by
 * `prefers-color-scheme` alone (no theme-toggle JS can run here). Without this, a
 * dark-mode user hitting this last-resort page would get a jarring white flash.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            --ge-bg: #ffffff;
            --ge-fg: #111111;
            --ge-muted: #555555;
            --ge-subtle: #888888;
            --ge-button-bg: #111111;
            --ge-button-fg: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ge-bg: #0a0a0a;
              --ge-fg: #f5f5f5;
              --ge-muted: #a3a3a3;
              --ge-subtle: #8a8a8a;
              --ge-button-bg: #f5f5f5;
              --ge-button-fg: #111111;
            }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100svh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          background: "var(--ge-bg)",
          color: "var(--ge-fg)",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 600 }}>
            Something broke
          </h1>
          <p style={{ margin: "0 0 1rem", color: "var(--ge-muted)" }}>
            The app hit a snag it couldn&rsquo;t recover from. Reloading usually fixes it.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: "0.75rem",
                color: "var(--ge-subtle)",
              }}
            >
              ref {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid var(--ge-button-bg)",
              borderRadius: "0.375rem",
              background: "var(--ge-button-bg)",
              color: "var(--ge-button-fg)",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
