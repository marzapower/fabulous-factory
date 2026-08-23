import * as React from "react";

import { cn } from "../lib/utils";

// NOTE: the upstream shadcn/ui registry source wraps `@radix-ui/react-label` (via the
// `radix-ui` package) for its accessibility niceties (auto-linking to the nearest form
// control, disabled-state propagation via a `peer`/`group`). That package is not part of
// this milestone's pre-provisioned dependency set (C.6) and this agent may not touch
// package.json/the lockfile, so this is a plain native `<label>` with the same className
// contract (data-slot, peer-disabled/group-disabled variants keep working since those are
// plain CSS selectors, not JS behavior). Swap back to the Radix primitive in a later
// milestone if `radix-ui` gets provisioned.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
