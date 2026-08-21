// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";
import type { ReactNode } from "react";

import type { FeatureMeta } from "./features-meta";

/** `children` is the status light slot — kept out of this server component's own render. */
export function FeatureCard({ feature, children }: { feature: FeatureMeta; children?: ReactNode }) {
  const Icon = feature.icon;

  return (
    <div className="fab-card flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
      <Icon aria-hidden="true" className="size-7 text-amber-600" />
      <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
      <p className="text-sm text-muted-foreground">{feature.blurb}</p>
      {children ? <div className="mt-1">{children}</div> : null}
      {feature.href ? (
        <Link
          href={feature.href}
          className="mt-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          How it works <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
