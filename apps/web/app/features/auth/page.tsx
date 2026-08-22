// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";
import Link from "next/link";

import { deriveAuthOptions } from "@factory/auth";
import { getCapabilities, getEnv, getEnvDocsForGroup } from "@factory/config";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";

export const metadata: Metadata = {
  title: FEATURES.auth.title,
  description: FEATURES.auth.blurb,
};

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

const authActionSnippet = `export const toggleTaskAction = defineAction({
  auth: "required",
  input: taskIdInput.extend({ status: z.enum(["open", "done"]) }),
  action: async ({ session, input }) => {
    // session.user is already resolved — defineAction rejected the request before
    // this body ever ran if there wasn't one.
    const updated = await setTaskStatus(input.id, session.user.id, input.status);
    if (!updated) {
      throw new ApiError(404, "task_not_found", "That task is gone already.");
    }
    return { id: input.id, status: input.status } as const;
  },
});`;

export default function AuthFeaturePage() {
  const vars = FEATURES.auth.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <FeaturePageShell feature={FEATURES.auth} statusSlot={<AuthStatus />}>
      <section>
        <h2 className="text-xl font-semibold">What it does</h2>
        <p className="mt-2 text-muted-foreground">
          From the caller&rsquo;s side: every session-gated route and server action gets a resolved,
          real <code className="font-mono">session.user</code> handed to it, or it never runs at all
          — there is no in-between state to handle.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">The rule it enforces</h2>
        <p className="mt-2 text-muted-foreground">
          Auth mode is mandatory, with no default. Every{" "}
          <code className="font-mono">defineAction</code> call states{" "}
          <code className="font-mono">auth: &quot;required&quot;</code> or{" "}
          <code className="font-mono">&quot;public&quot;</code> explicitly — there is nowhere to
          omit the decision, so a public action can never accidentally ship without one.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Real source</h2>
        <CodeBlock
          code={authActionSnippet}
          caption="apps/web/app/dashboard/actions.ts — toggleTaskAction"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold">A working example</h2>
        <p className="mt-2 text-muted-foreground">
          Auth is the one baseline that isn&rsquo;t optional — set{" "}
          <code className="font-mono">BETTER_AUTH_SECRET</code> and email/password sign-in works
          immediately; everything else here is an upgrade, not a requirement.
        </p>
        <div className="mt-4">
          <EnvTable vars={vars} />
        </div>
        <p className="mt-4 text-muted-foreground">
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
