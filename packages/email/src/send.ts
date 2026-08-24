/**
 * `send()`/`sendRendered()` — the package's two entry points (spec §5.6, plan E.2,
 * binding E.9). Both funnel through the same `deliver()` transport/degradation path:
 *   - `disabled`   → typed no-op, no render, no vendor SDK loaded at all.
 *   - `console`    → renders html+text, logs the rendered output, typed no-op (never
 *                    claims delivery — spec §5.6 is explicit that `console` must not
 *                    pretend to have delivered).
 *   - `resend`     → renders html+text, then `await import("resend")` (E.9.2/E.7: the
 *                    ONLY place this package may load the vendor SDK, and only on this
 *                    branch) and calls `resend.emails.send`, passing `html`+`text` and
 *                    NEVER the `react` field (E.1 — keeps `resend` the sole vendor import;
 *                    render happens once, here, not duplicated inside the SDK).
 *
 * `send()` looks a template up by name from this package's own `TEMPLATES` map (the auth
 * templates — `verify-email`/`magic-link` — the only ones this package still owns).
 * `sendRendered()` is the generic escape hatch for a caller (e.g. a preset domain
 * package) that owns its OWN React element and just needs the same transport/degradation
 * machinery — no template registration required, and no duplicate transport code.
 *
 * `@react-email/render`'s `render()` is invoked only inside `deliver()`, at request time
 * — never at module init (E.9.8) — so importing this package costs nothing extra at boot
 * even once `packages/auth` depends on it.
 */
import type { ReactElement } from "react";

import { render } from "@react-email/render";

import { getCapabilities, getEnv } from "@factory/config";

import { TEMPLATES, type TemplateName, type TemplateProps } from "./templates";

export type SendResult =
  | { delivered: true }
  | {
      delivered: false;
      reason: "disabled" | "console" | "provider-error" | "not-configured" | "timeout";
    };

/**
 * Lazy module-singleton for the Resend client (review fix, M5 cycle — mirrors the
 * analytics/observability vendor-SDK pattern instead of constructing a client per send).
 * Keyed on the API key so a changed key in tests (or a long-lived process with rotated
 * env) never sends with a stale client. Type-only `import("resend")` reference — erased
 * at compile time, so the SDK still loads ONLY via the guarded dynamic import below.
 */
let resendClient: import("resend").Resend | undefined;
let resendClientKey: string | undefined;

async function getResendClient(apiKey: string): Promise<import("resend").Resend> {
  if (!resendClient || resendClientKey !== apiKey) {
    const { Resend } = await import("resend");
    // The installed `resend` v6 types (`ResendOptions` exposes only `baseUrl`/`userAgent`)
    // confirm the SDK itself has no client- or call-level timeout knob. Conventions.md's
    // "every external call carries an explicit timeout" rule is satisfied one layer up
    // instead — `deliver()` races the actual `resend.emails.send` call against a local
    // timeout — so this constructor stays a plain, timeout-agnostic client.
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
  }
  return resendClient;
}

/** The shared transport/degradation path — the ONLY function in this package that reads
 * `getCapabilities()`/`getEnv()` for email or loads the `resend` SDK. Both `send()` and
 * `sendRendered()` fully reduce to this. */
async function deliver(subject: string, to: string, element: ReactElement): Promise<SendResult> {
  const capabilities = getCapabilities();

  if (capabilities.email === "disabled") {
    return { delivered: false, reason: "disabled" };
  }

  const text = await render(element, { plainText: true });

  if (capabilities.email === "console") {
    // Dev-only convenience transport (spec §5.6) — never claims delivery. The html
    // variant is deliberately NOT rendered on this path (review fix, M5 cycle) — console
    // only ever logs the text rendering.
    console.log(`[@factory/email] console transport — "${subject}" to ${to}\n---\n${text}\n---`);
    return { delivered: false, reason: "console" };
  }

  // capabilities.email === "resend" from here on.
  const env = getEnv();
  if (!env.EMAIL_FROM) {
    // `deriveCapabilities` only checks RESEND_API_KEY, not EMAIL_FROM — this is the one
    // combination doctor warns about separately (plan E.2/E.6).
    return { delivered: false, reason: "not-configured" };
  }

  const html = await render(element);
  const resend = await getResendClient(env.RESEND_API_KEY ?? "");

  // Conventions.md's "every external call carries an explicit timeout" rule, applied here
  // since the `resend` SDK itself exposes no such knob (see `getResendClient`): race the
  // actual send against a local bound instead. No retry — email isn't idempotent, and a
  // timed-out send may already be in flight at Resend, so retrying risks a duplicate.
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 10_000);
  });
  let outcome: Awaited<ReturnType<typeof resend.emails.send>> | "timeout";
  try {
    outcome = await Promise.race([
      resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text }),
      timeout,
    ]);
  } finally {
    // Also on a rejected send — a lost race must never leave the timer handle dangling.
    clearTimeout(timer!);
  }

  if (outcome === "timeout") {
    return { delivered: false, reason: "timeout" };
  }

  if (outcome.error) {
    console.error("[@factory/email] Resend provider error", outcome.error);
    return { delivered: false, reason: "provider-error" };
  }

  return { delivered: true };
}

export async function send<T extends TemplateName>(
  template: T,
  to: string,
  props: TemplateProps[T],
): Promise<SendResult> {
  const { Component, subject } = TEMPLATES[template];
  const element = Component(props);
  return deliver(subject, to, element);
}

/**
 * Generic rendered-send: a caller supplies its own already-built React element (e.g. a
 * preset domain package's own template, outside this package's `TEMPLATES` registry) and
 * gets the exact same transport/degradation path `send()` uses — no duplicate resend
 * client, no duplicate capability/env handling.
 */
export async function sendRendered(opts: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<SendResult> {
  return deliver(opts.subject, opts.to, opts.react);
}
