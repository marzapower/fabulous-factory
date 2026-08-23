// Internal copy — deliberately duplicated from each preset app's own `lib/utils.ts`
// (which stays in place; apps keep importing it as `@/lib/utils`, see conventions.md).
// Six lines, a drift gate covers the two staying in sync — not worth a shared package
// dependency for this package's own components to reach across the workspace boundary
// for.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
