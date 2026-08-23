// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { EnvVarSpec } from "@factory/config";

/** Renders env var metadata only — name, requirement, description, example. Never a value. */
export function EnvTable({ vars }: { vars: readonly EnvVarSpec[] }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Environment variables"
      className="fab-env-table overflow-x-auto rounded-lg border border-border"
    >
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">Environment variables that enable this feature</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground uppercase">
            <th scope="col" className="px-4 py-2 font-medium">
              Variable
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Required
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Description
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Example
            </th>
          </tr>
        </thead>
        <tbody>
          {vars.map((spec) => (
            <tr key={spec.name} className="border-b border-border/60 last:border-b-0">
              <td className="px-4 py-3 align-top font-mono text-xs text-foreground">{spec.name}</td>
              <td className="px-4 py-3 align-top">
                {spec.required ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                    required
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    optional
                  </span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-muted-foreground">{spec.description}</td>
              <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                {spec.example || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
