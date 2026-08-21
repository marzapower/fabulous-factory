// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

import { deriveAuthOptions } from "@factory/auth";
import { getCapabilities, getEnv, getEnvDocsForGroup } from "@factory/config";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";

// OAuth button visibility (and the status row below) is a runtime, server-side fact —
// never guessed client-side (design spec §5.1), same reason the login page itself is
// force-dynamic.
export const dynamic = "force-dynamic";

const OPTIONAL_PROVIDER_LABELS = { google: "Google", github: "GitHub" } as const;

/**
 * Server-rendered status row — deliberately NOT `StatusLight`: auth has no on/off
 * capability (it's the always-on baseline), only an always-on core plus a set of
 * optional sign-in methods. Derived exactly the way the login page derives its own
 * (`deriveAuthOptions(getEnv(), getCapabilities())`), exposing nothing the login page
 * doesn't already expose: enabled OAuth providers + magic-link availability.
 */
function AuthStatus() {
  const { enabledProviders, email } = deriveAuthOptions(getEnv(), getCapabilities());
  const optional = [
    ...enabledProviders.map((provider) => OPTIONAL_PROVIDER_LABELS[provider]),
    ...(email.magicLink ? ["Magic link"] : []),
  ];

  return (
    <div className="fab-status flex flex-wrap items-center gap-2 font-mono text-xs">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
        <span className="text-emerald-600 dark:text-emerald-400">email + password: always on</span>
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
        <span className="text-muted-foreground">no optional sign-in methods configured</span>
      )}
    </div>
  );
}

const authActionSnippet = `export const createMonitorAction = defineAction({
  auth: "required",
  input: createMonitorInput,
  rateLimit: { name: "create-monitor", windowSeconds: 60, max: 10 },
  action: async ({ session, input }) => {
    // session.user is already resolved — defineAction rejected the request before
    // this body ever ran if there wasn't one.
    // entitlement check elided — see the real file
    return createMonitorRow({ userId: session.user.id, ...input });
  },
});`;

export default function AuthFeaturePage() {
  const vars = FEATURES.auth.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <FeaturePageShell feature={FEATURES.auth} statusSlot={<AuthStatus />}>
      <section>
        <h2 className="text-xl font-semibold">What you get</h2>
        <p className="mt-2 text-muted-foreground">
          Better Auth, running on your own Postgres — no third-party auth vendor to trust or pay
          for. Email and password work the moment the app boots. Add OAuth client credentials or
          leave email enabled and Google, GitHub, or a magic link turn themselves on, no code change
          required. Every session-gated route and server action enforces this the same way, so there
          is exactly one place auth can be wrong.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">How it works here</h2>
        <p className="mt-2 text-muted-foreground">
          Every server action goes through <code className="font-mono">defineAction</code>, which
          requires an explicit auth mode. Set{" "}
          <code className="font-mono">auth: &quot;required&quot;</code> and the action never runs
          without a resolved session — no manual check to forget, and nothing to review for a
          missing one.
        </p>
        <CodeBlock
          code={authActionSnippet}
          caption="Simplified from apps/web/app/dashboard/actions.ts — createMonitorAction"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold">Turn it on</h2>
        <p className="mt-2 text-muted-foreground">
          Auth is the one baseline that isn&rsquo;t optional — set{" "}
          <code className="font-mono">BETTER_AUTH_SECRET</code> and email/password sign-in works
          immediately; everything else here is an upgrade, not a requirement.
        </p>
        <div className="mt-4">
          <EnvTable vars={vars} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Try it</h2>
        <p className="mt-2 text-muted-foreground">
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
          , then open the dashboard — that&rsquo;s <code className="font-mono">requireSession</code>{" "}
          doing its job.
        </p>
      </section>
    </FeaturePageShell>
  );
}
