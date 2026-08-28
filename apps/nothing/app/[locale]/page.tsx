import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { Link } from "@factory/i18n/navigation";

import { CodeBlock, SiteFooter, SiteHeader } from "@factory/ui/marketing";

// Static prose page (design spec shell idiom): no capability reads, no client state — a
// plain server component. The blank-slate homepage has nothing to render dynamically;
// the capability tour lives at /features, and the dashboard is where a live session's
// state shows up.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.home");

  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <SiteHeader brand="Fabulous Nothing" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-24">
        <p className="font-mono text-sm text-fab-marker">{t("eyebrow")}</p>

        <h1 className="mt-4 text-4xl leading-tight font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          {t("heading")}
          <span aria-hidden="true" className="fab-caret ml-1 inline-block w-[0.5em] bg-fab-live" />
        </h1>

        <div className="mt-12 flex flex-col divide-y divide-border border-t border-border">
          <Link
            href="/login"
            className="group flex items-center justify-between gap-4 py-4 text-lg text-foreground outline-none focus-visible:text-fab-live"
          >
            <span>{t("signInWorks")}</span>
            <span
              aria-hidden="true"
              className="font-mono text-muted-foreground transition-colors group-hover:text-fab-live group-focus-visible:text-fab-live"
            >
              /login
            </span>
          </Link>
          <Link
            href="/features"
            className="group flex items-center justify-between gap-4 py-4 text-lg text-foreground outline-none focus-visible:text-fab-live"
          >
            <span>{t("capabilityLive")}</span>
            <span
              aria-hidden="true"
              className="font-mono text-muted-foreground transition-colors group-hover:text-fab-live group-focus-visible:text-fab-live"
            >
              /features
            </span>
          </Link>
          <Link
            href="/features/kernel"
            className="group flex items-center justify-between gap-4 py-4 text-lg text-foreground outline-none focus-visible:text-fab-live"
          >
            <span>
              {t.rich("restIsGen", {
                code: (chunks) => (
                  <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-base text-foreground">
                    {chunks}
                  </code>
                ),
              })}
            </span>
            <span
              aria-hidden="true"
              className="font-mono text-muted-foreground transition-colors group-hover:text-fab-live group-focus-visible:text-fab-live"
            >
              /features/kernel
            </span>
          </Link>
        </div>

        <div className="mt-16">
          <CodeBlock code={t("installCommand")} />
        </div>
      </main>

      <SiteFooter />

      {/* Signature element: a blinking terminal caret after the display line. `steps(1)`
          gives it the hard on/off snap of a real terminal cursor rather than a smooth
          fade. Fully disabled under prefers-reduced-motion — a static, lit caret reads
          fine as a period-like mark on its own. */}
      <style>{`
        .fab-caret {
          height: 0.85em;
          transform: translateY(0.08em);
          animation: fab-caret-blink 1s steps(1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .fab-caret {
            animation: none;
          }
        }
        @keyframes fab-caret-blink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
