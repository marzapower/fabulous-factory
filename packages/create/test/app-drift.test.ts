/**
 * Maintainer-only drift gate (this file itself is excluded from every composed product
 * repo via `compose.config.ts`'s `BASE_EXCLUDED_FILES` — a single-preset product repo
 * only ever has one `apps/web`, so this test's whole premise doesn't apply there).
 *
 * A handful of files are deliberately duplicated byte-for-byte across the three preset
 * apps (`apps/untangle`, `apps/nothing`, `apps/brainstorm`) rather than factored into
 * `@factory/ui` or a shared package — infrastructure so small and so tied to each app's
 * own root that a shared indirection would cost more than it saves (an app's own
 * `tsconfig.json`, `postcss.config.mjs`, `vitest.config.mts`; framework-mandated
 * passthrough routes; the shared IBM Plex webfont files every app ships). That's a
 * deliberate choice, not an oversight — but it only stays safe as long as the copies
 * actually stay identical. This test is the tripwire: it fails loudly, with an
 * actionable message, the moment one copy drifts from the others instead of letting the
 * apps silently diverge.
 *
 * The settings/reset-password/forgot-password pages used to be on that list too, kept as
 * near-duplicates rather than a shared module under the same "small and root-tied"
 * reasoning. That reasoning held only as long as the pages stayed thin passthroughs; it
 * stopped holding once their bodies grew real logic — a live session fetch and password-
 * account lookup on the settings page, an `isEnabled("email")` capability gate on
 * forgot-password, a `useSearchParams()`-driven `<Suspense>` boundary on reset-password —
 * past the threshold where a shared indirection pays for itself. They're now
 * `AccountSettingsPage`/`ResetPasswordPage`/`ForgotPasswordPage` in `@factory/ui/auth`
 * (`packages/ui/src/auth/`), each taking an `appName` prop; each app's own `page.tsx` is a
 * thin wrapper that keeps only what Next.js requires to live per-app (`export const
 * metadata`, `export const dynamic`) and delegates its default export's body to the
 * shared component. There's no near-duplicate comparison left in this file for them — no
 * copy left to drift, so nothing left to normalize a `metadata.description` delta out of.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const DRIFT_MESSAGE =
  "these files are intentionally identical across preset apps — sync your edit to all copies or move it into @factory/ui";

/** Canonical app every other app is diffed against — untangle is the canonical copy. */
const CANONICAL_APP = "untangle";
const OTHER_APPS = ["nothing", "brainstorm"];

/** Repo-root-relative, `apps/<app>/`-relative paths — every file that stays deliberately
 * byte-identical across all three preset apps. */
const SHARED_APP_FILES = [
  "lib/utils.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "vitest.config.mts",
  "app/api/health/route.ts",
  "app/api/demo/kernel-echo/route.ts",
  "app/api/demo/security-check/route.ts",
  "app/api/auth/[...all]/route.ts",
  // Error/not-found surfaces (T9, wave 3): all three build on `@factory/ui/feedback`
  // with no per-app copy, so there's nothing left to vary — kept as one shared file
  // per the same "small + tied to root, not worth an indirection" reasoning as the rest
  // of this list, rather than duplicated with a comment saying "these must match".
  "app/error.tsx",
  "app/not-found.tsx",
  "app/global-error.tsx",
  // Shared IBM Plex webfont files (+ their OFL) — every preset app ships these, even
  // brainstorm, which also ships its own additional Space Grotesk files (NOT compared
  // here — those are brainstorm-only, deliberately not duplicated anywhere else).
  "app/fonts/ibm-plex-mono-400.woff2",
  "app/fonts/ibm-plex-mono-500.woff2",
  "app/fonts/ibm-plex-sans-400.woff2",
  "app/fonts/ibm-plex-sans-600.woff2",
  "app/fonts/ibm-plex-sans-700.woff2",
  "app/fonts/OFL.txt",
];

function readAppFile(app: string, relPath: string): Buffer {
  return readFileSync(path.join(repoRoot, "apps", app, relPath));
}

describe("preset app drift gate", () => {
  describe.each(OTHER_APPS)(`apps/%s vs apps/${CANONICAL_APP}`, (app) => {
    it.each(SHARED_APP_FILES)("%s stays byte-identical", (relPath) => {
      const canonical = readAppFile(CANONICAL_APP, relPath);
      const other = readAppFile(app, relPath);
      expect(other.equals(canonical), `${relPath}: ${DRIFT_MESSAGE}`).toBe(true);
    });
  });

  it("packages/ui/src/lib/utils.ts stays in sync with the canonical app copy", () => {
    // packages/ui/src/lib/utils.ts carries its own explanatory header comment (why the
    // duplication exists) that the app copies don't — so this compares the actual code,
    // not raw file bytes, against apps/untangle/lib/utils.ts.
    const uiSource = readFileSync(path.join(repoRoot, "packages/ui/src/lib/utils.ts"), "utf8");
    const uiCode = uiSource.replace(/^(?:\/\/[^\n]*\n)+/, "");
    const canonicalSource = readAppFile(CANONICAL_APP, "lib/utils.ts").toString("utf8");
    expect(uiCode, `packages/ui/src/lib/utils.ts: ${DRIFT_MESSAGE}`).toBe(canonicalSource);
  });
});
