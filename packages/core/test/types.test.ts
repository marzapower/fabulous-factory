// Compile-time contract proofs (plan D.9.7). This file is executed by `vitest run` like
// any other test (so it must not throw or hang — none of the `defineHandler`/
// `defineAction` results below are ever invoked, only constructed), but its real job is
// to be typechecked by `tsc --noEmit`: `expectTypeOf(...).toEqualTypeOf<...>()` is a
// pure compile-time assertion (mismatched generics fail `tsc` directly), and the
// `@ts-expect-error` fixtures below only typecheck cleanly if the annotated line
// genuinely fails without the directive.
import type { Session } from "@factory/auth";
import { z } from "zod";
import { describe, expectTypeOf, it, vi } from "vitest";

import { defineAction } from "../src/define-action";
import { defineHandler } from "../src/define-handler";

// `@factory/auth`'s real module instantiates a Better Auth instance (via `getDb()`) at
// import time — mock it purely to avoid that side effect; none of these type-proof
// bodies ever run, so the mock's behavior doesn't matter, only its shape.
vi.mock("@factory/auth", () => ({
  getSession: vi.fn(),
}));

describe("defineHandler — type-level contracts", () => {
  it("auth: 'required' narrows ctx.session to a non-nullable Session", () => {
    defineHandler({
      auth: "required",
      input: "none",
      handler: async (ctx) => {
        expectTypeOf(ctx.session).toEqualTypeOf<Session>();
        return null;
      },
    });
  });

  it("auth: 'public' widens ctx.session to Session | null", () => {
    defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => {
        expectTypeOf(ctx.session).toEqualTypeOf<Session | null>();
        return null;
      },
    });
  });

  it("a zod input schema infers ctx.input", () => {
    const schema = z.object({ name: z.string() });
    defineHandler({
      auth: "public",
      input: schema,
      rateLimit: "none",
      handler: async (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<{ name: string }>();
        return null;
      },
    });
  });

  it("input: 'none' infers ctx.input as undefined", () => {
    defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<undefined>();
        return null;
      },
    });
  });

  it("params is Record<string, string | string[] | undefined> (plan D.9.9)", () => {
    defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => {
        expectTypeOf(ctx.params).toEqualTypeOf<Record<string, string | string[] | undefined>>();
        return null;
      },
    });
  });
});

describe("defineAction — type-level contracts", () => {
  it("auth: 'required' narrows ctx.session to a non-nullable Session", () => {
    defineAction({
      auth: "required",
      input: "none",
      action: async (ctx) => {
        expectTypeOf(ctx.session).toEqualTypeOf<Session>();
        return null;
      },
    });
  });

  it("auth: 'public' widens ctx.session to Session | null", () => {
    defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async (ctx) => {
        expectTypeOf(ctx.session).toEqualTypeOf<Session | null>();
        return null;
      },
    });
  });

  it("a zod input schema infers ctx.input", () => {
    const schema = z.object({ name: z.string() });
    defineAction({
      auth: "public",
      input: schema,
      rateLimit: "none",
      action: async (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<{ name: string }>();
        return null;
      },
    });
  });

  it("input: 'none' infers ctx.input as undefined", () => {
    defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<undefined>();
        return null;
      },
    });
  });
});

// --- Negative fixtures (never invoked — construction only) ------------------------

// A public HANDLER must state a rateLimit decision (plan D.4/D.9.7) — omitting it must
// fail to compile.
// @ts-expect-error — public handler is missing the required `rateLimit` key
const _publicHandlerWithoutRateLimit: ReturnType<typeof defineHandler> = defineHandler({
  auth: "public",
  input: "none",
  handler: async () => null,
});
void _publicHandlerWithoutRateLimit;

// A public ACTION must equally state a rateLimit decision.
// @ts-expect-error — public action is missing the required `rateLimit` key
const _publicActionWithoutRateLimit: ReturnType<typeof defineAction> = defineAction({
  auth: "public",
  input: "none",
  action: async () => null,
});
void _publicActionWithoutRateLimit;

// --- webhook arm negative fixtures (H.10.1: own discriminant, no input/rateLimit/handler) --

// The webhook arm must reject an `input` key — it has no discriminant overlap with
// `"public"`/`"required"`, so this is a plain excess-property check on its own arm.
// Excess-property errors surface AT the offending property, not the assignment line, so
// `@ts-expect-error` sits directly above each one (unlike the missing-property fixtures
// above, where the error surfaces at the assignment).
const _webhookWithInput: ReturnType<typeof defineHandler> = defineHandler({
  auth: "webhook",
  // @ts-expect-error — webhook arm does not accept `input`
  input: "none",
  webhook: async () => new Response(null, { status: 200 }),
});
void _webhookWithInput;

const _webhookWithRateLimit: ReturnType<typeof defineHandler> = defineHandler({
  auth: "webhook",
  // @ts-expect-error — webhook arm does not accept `rateLimit`
  rateLimit: "none",
  webhook: async () => new Response(null, { status: 200 }),
});
void _webhookWithRateLimit;

const _webhookWithHandler: ReturnType<typeof defineHandler> = defineHandler({
  auth: "webhook",
  // @ts-expect-error — webhook arm does not accept `handler` (it takes `webhook` instead)
  handler: async () => null,
});
void _webhookWithHandler;

// @ts-expect-error — webhook arm requires the `webhook` key
const _webhookMissingFn: ReturnType<typeof defineHandler> = defineHandler({
  auth: "webhook",
});
void _webhookMissingFn;
