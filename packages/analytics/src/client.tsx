"use client";

import { Suspense, useEffect, useRef, type JSX, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useClientConfig } from "@factory/config/client";

/**
 * Type-only reference to posthog-js's default export (an already-constructed `PostHog`
 * instance — see its `dist/module.d.ts`: `declare const posthog: PostHog; export {
 * posthog as default }`). `posthog-js`'s default export is a VALUE, not a type, so a bare
 * `import("posthog-js").default` type query (which only searches the module's type space)
 * doesn't resolve it — `(typeof import(...))["default"]` reads it from the value space
 * instead. Either way this is erased at compile time by `verbatimModuleSyntax`, so this
 * declaration alone adds no runtime dependency on posthog-js. Only the `await
 * import("posthog-js")` calls below actually load the SDK, and those run solely behind
 * the `posthog !== null` guard (E.9.4).
 */
type PostHogClient = (typeof import("posthog-js"))["default"];

let posthogSingleton: PostHogClient | undefined;
let posthogInitPromise: Promise<PostHogClient> | undefined;

/**
 * Idempotent lazy init: the first caller triggers `await import("posthog-js")` +
 * `.init()`; every subsequent caller — `AnalyticsProvider`'s own effect and
 * `PageviewTracker`'s effect, which may fire before or after it depending on React's
 * child-before-parent effect ordering — shares the same in-flight promise / singleton, so
 * posthog-js is fetched and initialized at most once per page load, and a re-render or
 * React StrictMode's double-effect invocation never re-inits it.
 */
async function ensurePostHogInitialized(key: string, host: string): Promise<PostHogClient> {
  if (posthogSingleton) return posthogSingleton;
  if (!posthogInitPromise) {
    posthogInitPromise = (async () => {
      const posthog = (await import("posthog-js")).default;
      posthog.init(key, {
        api_host: host,
        // We capture pageviews ourselves (PageviewTracker, below) via usePathname/
        // useSearchParams, since the App Router fires no route-change events for
        // posthog-js's own history-API instrumentation to hook into.
        capture_pageview: false,
        defaults: "2026-01-30",
      });
      posthogSingleton = posthog;
      return posthog;
    })();
  }
  return posthogInitPromise;
}

export interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Reads `useClientConfig().posthog` — server-resolved through `ClientConfigProvider`,
 * never a build-time `NEXT_PUBLIC_*` value (spec §5.1). When non-null, lazily initializes
 * posthog-js in a `useEffect` and mounts a pageview tracker; when null, renders `children`
 * untouched — no import, no init, no tracker (E.9.4).
 *
 * Mount this once, inside the app's existing `<ClientConfigProvider>` subtree.
 */
export function AnalyticsProvider({ children }: AnalyticsProviderProps): JSX.Element {
  const { posthog } = useClientConfig();
  const initStarted = useRef(false);

  useEffect(() => {
    if (!posthog || initStarted.current) return;
    // Belt-and-suspenders alongside `ensurePostHogInitialized`'s own idempotency: avoids
    // even a redundant call into it on a re-render or StrictMode's double-effect.
    initStarted.current = true;
    void ensurePostHogInitialized(posthog.key, posthog.host).catch((error) => {
      console.error("[@factory/analytics] posthog-js init failed:", error);
    });
  }, [posthog]);

  if (!posthog) return <>{children}</>;

  return (
    <>
      {children}
      {/* useSearchParams() requires a Suspense boundary in the App Router (Next.js docs) —
          scoped here so every mounting page doesn't need its own. */}
      <Suspense fallback={null}>
        <PageviewTracker posthogKey={posthog.key} posthogHost={posthog.host} />
      </Suspense>
    </>
  );
}

interface PageviewTrackerProps {
  posthogKey: string;
  posthogHost: string;
}

/**
 * Captures a `$pageview` event on every pathname/query-string change. The App Router has
 * no route-change events to hook (E.4/E.9.4) — `usePathname()`/`useSearchParams()` plus an
 * effect is the documented manual substitute.
 *
 * Deliberately "folded in" to `AnalyticsProvider` rather than exported standalone: it
 * awaits `ensurePostHogInitialized` itself (instead of only relying on
 * `AnalyticsProvider`'s effect for a ready singleton), so the very first pageview isn't
 * dropped to React's child-before-parent effect-firing order on initial mount.
 */
function PageviewTracker({ posthogKey, posthogHost }: PageviewTrackerProps): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    void ensurePostHogInitialized(posthogKey, posthogHost)
      .then((client) => {
        if (cancelled) return;
        const search = searchParams.toString();
        const path = search ? `${pathname}?${search}` : pathname;
        // PostHog expects an absolute URL for $current_url; a bare pathname breaks its
        // host/path parsing. `window` is always defined here — this is a client effect.
        client.capture("$pageview", {
          $current_url: `${window.location.origin}${path}`,
        });
      })
      .catch((error) => {
        console.error("[@factory/analytics] pageview capture failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [posthogKey, posthogHost, pathname, searchParams]);

  return null;
}
