import { headers } from "next/headers";
import { z } from "zod";

import { getSession, type Session } from "@factory/auth";

import { ApiError } from "./errors";
import { getClientIp } from "./get-client-ip";
import { checkRateLimit, type NamedRateLimitPolicy } from "./rate-limit";

type InferInput<S extends z.ZodTypeAny | "none"> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

export interface ActionIssue {
  path: (string | number)[];
  message: string;
}

export interface ActionError {
  code: string;
  message: string;
  issues?: ActionIssue[];
}

/**
 * Actions NEVER throw to the caller (plan D.4) — Next masks server errors in
 * production, so a typed envelope is the only honest client contract. Every failure,
 * from every step of the wrapper, is a `{ ok: false }` result; success is `{ ok: true,
 * data }`.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

// Once-per-process emission (I.3.b/opt-6), mirroring `define-handler.ts`'s identical
// tolerance: a module-level flag rather than per-request logging, so a broken auth stack
// under sustained public traffic logs one line, not a stream of stack traces. A separate
// flag from `define-handler.ts`'s own (each module owns its process-lifetime state) —
// the two wrappers are independent call sites that can each fail on their own schedule.
let sessionFailureWarned = false;

function warnSessionFailureOnce(err: unknown): void {
  if (sessionFailureWarned) return;
  sessionFailureWarned = true;
  console.error(
    "[@factory/core] getSession() failed on a public action — degrading to session: null (this warning is emitted once per process)",
    err,
  );
}

/**
 * Same auth-mode union as `HandlerOptions` (plan D.4): public actions must state a
 * rate-limit decision, required-auth actions may omit it.
 */
export type ActionOptions<S extends z.ZodTypeAny | "none", T> =
  | {
      auth: "required";
      input: S;
      rateLimit?: NamedRateLimitPolicy | "none";
      action: (ctx: { session: Session; input: InferInput<S> }) => Promise<T>;
    }
  | {
      auth: "public";
      input: S;
      rateLimit: NamedRateLimitPolicy | "none";
      action: (ctx: { session: Session | null; input: InferInput<S> }) => Promise<T>;
    };

/**
 * The only legal way to declare a `"use server"` export (spec §8.4, backstopped by the
 * raw-export lint ban, plan D.5). Runtime order mirrors `defineHandler` minus the origin
 * check: Next 16 Server Actions ship built-in Origin↔Host verification for their POST
 * transport, so duplicating it here would be redundant (plan D.1/D.9.11).
 *
 *   1. session    — resolved once via `getSession()`, tolerant of a failing auth stack
 *                   (I.3.b, unconditional here — `defineAction` HAS a public arm and
 *                   calls `getSession()` unconditionally): `auth: "required"` rethrows,
 *                   caught below and shaped to `internal_error` (no HTTP status exists
 *                   for a Server Action); `public` degrades to `session: null`.
 *   2. rate limit — subject `user:{id}` when a session exists, else `ip:{clientIp}`
 *                   (via `next/headers`, since actions receive no `Request` object).
 *   3. auth       — `'required'` + no session → `{ ok: false, error: { code: "unauthorized" } }`.
 *   4. input      — `FormData` is converted via `Object.fromEntries` before the zod
 *                   parse (plan D.9.13); zod failure → `{ ok: false, error: { code: "invalid_input", issues } }`.
 *   5. action     — any thrown `ApiError` is shaped into its `{ code, message }`;
 *                   anything else is an opaque `internal_error`, logged server-side.
 */
export function defineAction<S extends z.ZodTypeAny | "none", T>(
  opts: ActionOptions<S, T>,
): (rawInput: unknown) => Promise<ActionResult<T>> {
  return async function runAction(rawInput) {
    try {
      // Same tolerance as `defineHandler`'s identical try/catch (I.3.b — see its CONTRACT
      // note for the full rationale): `auth: "required"` rethrows, `public` degrades to
      // `session: null`. The rethrow lands in THIS function's own outer catch below,
      // which has no HTTP status to shape — it becomes `{ ok: false, error: { code:
      // "internal_error" } }`, the same envelope any other unexpected action failure gets.
      let session: Awaited<ReturnType<typeof getSession>> = null;
      try {
        session = await getSession();
      } catch (err) {
        if (opts.auth === "required") throw err;
        warnSessionFailureOnce(err);
      }

      if (opts.rateLimit && opts.rateLimit !== "none") {
        const subject = session ? `user:${session.user.id}` : `ip:${getClientIp(await headers())}`;
        const result = await checkRateLimit({
          name: opts.rateLimit.name,
          subject,
          windowSeconds: opts.rateLimit.windowSeconds,
          max: opts.rateLimit.max,
        });
        if (!result.allowed) {
          return {
            ok: false,
            error: { code: "rate_limited", message: "Too many requests" },
          };
        }
      }

      if (opts.auth === "required" && !session) {
        return {
          ok: false,
          error: { code: "unauthorized", message: "Authentication required" },
        };
      }

      const input = parseActionInput(rawInput, opts.input);
      if (!input.ok) {
        return input;
      }

      const action = opts.action as (ctx: {
        session: Session | null;
        input: InferInput<S>;
      }) => Promise<T>;
      const data = await action({ session, input: input.data });
      return { ok: true, data };
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      console.error("[@factory/core] unhandled error in action", err);
      return {
        ok: false,
        error: { code: "internal_error", message: "Internal server error" },
      };
    }
  };
}

/**
 * `rawInput instanceof FormData` is converted via `Object.fromEntries(rawInput.entries())`
 * before the zod parse (plan D.9.13). Documented limitation: `FormData` can carry
 * repeated keys (e.g. multi-select checkboxes); `Object.fromEntries` keeps only the last
 * value per key. Acceptable for M3 — no consumer needs multi-value fields yet.
 */
function parseActionInput<S extends z.ZodTypeAny | "none">(
  rawInput: unknown,
  schema: S,
): { ok: true; data: InferInput<S> } | { ok: false; error: ActionError } {
  if (schema === "none") {
    return { ok: true, data: undefined as InferInput<S> };
  }

  const candidate =
    rawInput instanceof FormData ? Object.fromEntries(rawInput.entries()) : rawInput;
  const result = (schema as z.ZodTypeAny).safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Invalid input",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === "symbol" ? segment.toString() : segment,
          ),
          message: issue.message,
        })),
      },
    };
  }
  return { ok: true, data: result.data as InferInput<S> };
}
