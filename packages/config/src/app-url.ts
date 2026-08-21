import { getEnv } from "./env";

/** Single source for the local-dev fallback (H.10.14) — also used by
 * `public-config.ts#buildClientConfig`, which stays pure and must never call `getEnv()`
 * itself, so it calls `resolveAppUrl` with its own already-parameter'd env value instead. */
export const DEFAULT_APP_URL = "http://localhost:3000";

/** Pure. `APP_URL` when set, else the local-dev default. */
export function resolveAppUrl(appUrl: string | undefined): string {
  return appUrl ?? DEFAULT_APP_URL;
}

/**
 * The app's public base URL (H.10.14) — billing checkout/portal redirect URLs, email
 * links, and the origin-check fallback all resolve it through here, one place, so it
 * only has one fallback value to ever drift. Reads live env via `getEnv()`; doctor warns
 * separately when billing is enabled and `APP_URL` is unset (redirects would otherwise
 * silently point at localhost).
 */
export function getAppUrl(): string {
  return resolveAppUrl(getEnv().APP_URL);
}
