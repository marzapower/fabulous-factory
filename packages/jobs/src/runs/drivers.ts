import type { RunDriver } from "./engine";

/**
 * Executes the wrapped unit in-process, immediately, with no queueing and no retries.
 * This is the only driver available when the `jobs` capability resolves to `disabled` —
 * it needs no external durability layer at all, which is exactly what keeps an
 * interactive run byte-identical whether or not background jobs are configured.
 */
export const inlineDriver: RunDriver = async (_key, fn) => fn();

/**
 * Wraps each engine step in one Inngest `step.run` call, giving it per-step retries and
 * replay durability for free. `step` is typed structurally (just the one method this
 * file actually calls) rather than imported from `inngest` — this file needs no import
 * from the vendor SDK beyond what `client.ts` already owns, and any object shaped like
 * Inngest's step tool works here, including a test double.
 */
export function durableDriver(step: {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
}): RunDriver {
  return (key, fn) => step.run(key, fn);
}
