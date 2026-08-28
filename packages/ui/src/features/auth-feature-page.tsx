// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { deriveAuthOptions } from "@factory/auth";
import { getCapabilities, getEnv, getEnvDocsForGroup } from "@factory/config";

import { CodeBlock, EnvTable, FeaturePageShell, FEATURES, featureMeta } from "../marketing";

const OPTIONAL_PROVIDER_LABELS = { google: "Google", github: "GitHub" } as const;

/**
 * Server-rendered status row — deliberately NOT `StatusLight`: auth has no on/off
 * capability (it's the always-on baseline), only an always-on core plus a set of
 * optional sign-in methods. Derived exactly the way the login page derives its own
 * (`deriveAuthOptions(getEnv(), getCapabilities())`), exposing nothing the login page
 * doesn't already expose: enabled OAuth providers + magic-link availability.
 */
function AuthStatus() {
  const t = useTranslations("ui.featurePages.auth");
  const { enabledProviders, email } = deriveAuthOptions(getEnv(), getCapabilities());
  const optional = [
    ...enabledProviders.map((provider) => OPTIONAL_PROVIDER_LABELS[provider]),
    ...(email.magicLink ? [t("statusMagicLink")] : []),
  ];

  return (
    <div className="fab-status flex flex-wrap items-center gap-2 font-mono text-xs">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
        <span className="text-emerald-600 dark:text-emerald-400">{t("statusAlwaysOn")}</span>
      </span>
      {optional.length > 0 ? (
        optional.map((name) => (
          <span
            key={name}
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {name}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">{t("statusNoOptional")}</span>
      )}
    </div>
  );
}

/**
 * The "Real source" section is the one part of this page that can't be shared verbatim
 * (K.16 truth sweep): only a preset that actually has an auth-gated `defineAction` in
 * its own repo can honestly caption a snippet "Real source" at a real `apps/web` path —
 * a preset with none must present the same shape as a pattern instead, with an honest
 * heading and caption, never a fabricated path.
 */
export interface AuthSourceExample {
  /** Section heading — "Real source" only when `snippet` is quoted from this preset's
   * own repo; something honest like "The shape you'll write" otherwise. */
  heading: string;
  snippet: string;
  /** An `apps/web/...` path + symbol when `snippet` is real; an honest non-path label
   * (e.g. "Example — what you'll write") when it's a pattern, never a fabricated path. */
  caption: string;
}

export function AuthFeaturePage({
  brand,
  emoji,
  sourceExample,
}: {
  brand: string;
  emoji?: string;
  sourceExample: AuthSourceExample;
}) {
  const t = useTranslations("ui.featurePages.auth");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const vars = FEATURES.auth.groups.flatMap((group) => getEnvDocsForGroup(group));
  const feature = featureMeta(tf, "auth");

  return (
    <FeaturePageShell feature={feature} brand={brand} emoji={emoji} statusSlot={<AuthStatus />}>
      <section>
        <h2 className="text-xl font-semibold">{tc("whatItDoes")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("whatItDoesBody", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("ruleItEnforces")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("ruleBody", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{sourceExample.heading}</h2>
        <CodeBlock code={sourceExample.snippet} caption={sourceExample.caption} />
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("workingExampleBody", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
        <div className="mt-4">
          <EnvTable vars={vars} />
        </div>
        <p className="mt-4 text-muted-foreground">
          {t.rich("ctaParagraph", {
            link: (chunks) => (
              <Link
                href="/signup"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      </section>
    </FeaturePageShell>
  );
}
