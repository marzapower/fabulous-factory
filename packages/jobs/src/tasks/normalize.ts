/**
 * `normalizeContent` — carried verbatim (K.5: "already correct and already reasoned
 * about; do not rewrite it") from the retired `packages/jobs/src/demo/check-monitor.ts`,
 * for the paste-a-URL capture path (`POST /api/runs`, T8): a fetched page is normalized
 * the same way the page-monitor demo normalized fetched pages before hashing/storing
 * them.
 *
 * Strips `<script>`/`<style>` blocks and all remaining tags, then collapses whitespace —
 * storing raw HTML would be noisy (nonces, timestamps, analytics beacons churn on every
 * response even when the visible page hasn't changed). No entity decoding beyond that:
 * best-effort only — a highly dynamic page (client-side rendered content, randomized ad
 * slots) may still read oddly. Capped to `MAX_CAPTURE_CHARS` since the result is what's
 * stored verbatim as `captures.raw_text`.
 */
import { MAX_CAPTURE_CHARS } from "./constants";

export function normalizeContent(html: string): string {
  const withoutScripts = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    " ",
  );
  const withoutTags = withoutStyles.replace(/<[^>]*>/g, " ");
  const collapsed = withoutTags.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_CAPTURE_CHARS);
}
