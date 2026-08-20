const UNTRUSTED_BRAND = Symbol("untrusted");

/**
 * Structural "this is data, not instructions" marker (spec §8.5) for external,
 * model-adjacent content — scraped pages, emails, uploads. Minimal in M3 (plan D.4): the
 * LLM gateway (M5) is the actual consumer of the brand; this package only defines it so
 * every producer of untrusted content has one shared type to reach for from day one.
 *
 * A real runtime tag (not just a type-level cast) so `isUntrusted` can verify it — a
 * brand that only existed in the type system would make `isUntrusted` either always
 * `false` or an unchecked lie.
 */
export interface Untrusted<T> {
  readonly [UNTRUSTED_BRAND]: true;
  readonly value: T;
}

/** Wraps `value` as untrusted content. */
export function untrusted<T>(value: T): Untrusted<T> {
  return { [UNTRUSTED_BRAND]: true, value };
}

/** True iff `value` was produced by `untrusted()`. */
export function isUntrusted(value: unknown): value is Untrusted<unknown> {
  return typeof value === "object" && value !== null && UNTRUSTED_BRAND in value;
}
