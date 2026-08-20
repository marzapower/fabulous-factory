/**
 * `send()` — the package's single entry point (spec §5.6, plan E.2, binding E.9).
 *
 * Reads `getCapabilities().email` (never `process.env` directly — E.9.2 / the
 * `factory/no-process-env` lint rule) and picks one of three paths:
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
 * `@react-email/render`'s `render()` is invoked only inside this function, at request
 * time — never at module init (E.9.8) — so importing this package costs nothing extra at
 * boot even once `packages/auth` depends on it.
 */
import { render } from "@react-email/render";

import { getCapabilities, getEnv } from "@factory/config";

import { TEMPLATES, type TemplateName, type TemplateProps } from "./templates";

export type SendResult =
  | { delivered: true }
  | { delivered: false; reason: "disabled" | "console" | "provider-error" | "not-configured" };

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
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
  }
  return resendClient;
}

/** One subject line per template — kept here rather than per-template so callers never
 * have to pass a subject themselves. */
const SUBJECTS: Record<TemplateName, string> = {
  "verify-email": "Verify your email address",
  "magic-link": "Your sign-in link",
};

export async function send<T extends TemplateName>(
  template: T,
  to: string,
  props: TemplateProps[T],
): Promise<SendResult> {
  const capabilities = getCapabilities();

  if (capabilities.email === "disabled") {
    return { delivered: false, reason: "disabled" };
  }

  const element = TEMPLATES[template](props);
  const subject = SUBJECTS[template];
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
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });

  if (error) {
    console.error("[@factory/email] Resend provider error", error);
    return { delivered: false, reason: "provider-error" };
  }

  return { delivered: true };
}
