// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useState } from "react";

import { useTranslations } from "@factory/i18n";

import { LiveExample } from "../marketing";

const MAX_MESSAGE_CHARS = 200;

type EchoResult =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "error"; status: number; body: unknown }
  | { kind: "network-error"; message: string };

/**
 * Calls the real `POST /api/demo/kernel-echo` route and shows the raw HTTP status +
 * response — the wrapper's own auth/validation/rate-limit decisions, produced for real
 * (K.15.3). Sending an empty message demonstrates the 400; sending several times fast
 * demonstrates the 429. Nothing here reaches outside this deployment.
 */
export function KernelEchoDemo() {
  const t = useTranslations("ui.featurePages.echoDemo");
  const [message, setMessage] = useState(() => t("defaultMessage"));
  const [result, setResult] = useState<EchoResult | null>(null);
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    try {
      const response = await fetch("/api/demo/kernel-echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body: unknown = await response.json().catch(() => undefined);
      setResult({ kind: response.ok ? "ok" : "error", status: response.status, body });
    } catch (err) {
      setResult({
        kind: "network-error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <LiveExample kind="live" title={t("liveExampleTitle")}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="kernel-echo-message">
          {t("messageLabel")}
        </label>
        <input
          id="kernel-echo-message"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          value={message}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("placeholder")}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? t("sending") : t("sendButton")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.rich("hint", {
          rateLimit: () => <code className="font-mono">{"{ windowSeconds: 60, max: 8 }"}</code>,
        })}
      </p>
      {result ? (
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
          {result.kind === "network-error"
            ? t("networkError", { message: result.message })
            : `${t("httpStatus", { status: result.status })}\n${JSON.stringify(result.body, null, 2)}`}
        </pre>
      ) : null}
    </LiveExample>
  );
}
