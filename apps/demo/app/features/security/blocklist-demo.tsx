// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useState } from "react";

import { LiveExample } from "@/components/marketing/live-example";

// K.16 N1: labeled "IP address", never "hostname" or "URL" — isBlockedAddress takes an
// IP literal and fails closed (blocked) for anything else, so a hostname would render a
// false BLOCKED and misteach the guard it's demonstrating.
const SEED_ADDRESSES = [
  "169.254.169.254", // cloud metadata endpoint
  "10.0.0.1", // RFC1918 private range
  "127.0.0.1", // loopback
  "::ffff:169.254.169.254", // IPv4-mapped IPv6 form of the metadata endpoint
  "8.8.8.8", // public — not blocked
];

const MAX_ADDRESS_CHARS = 64;

type CheckResult =
  | { kind: "ok"; blocked: boolean }
  | { kind: "error"; status: number }
  | { kind: "network-error"; message: string };

/**
 * Calls the real `POST /api/demo/security-check` route, which evaluates the pure
 * `isBlockedAddress` predicate — DNS-free, no fetch ever performed. Pre-seeded with IP
 * literals rather than an open text field for a hostname (K.16 N1).
 */
export function SecurityBlocklistDemo() {
  const [address, setAddress] = useState(SEED_ADDRESSES[0]!);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [pending, setPending] = useState(false);

  async function check(next: string) {
    setAddress(next);
    setPending(true);
    try {
      const response = await fetch("/api/demo/security-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: next }),
      });
      if (!response.ok) {
        setResult({ kind: "error", status: response.status });
        return;
      }
      const body = (await response.json()) as { blocked: boolean };
      setResult({ kind: "ok", blocked: body.blocked });
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
    <LiveExample kind="live" title="Check an IP address">
      <div className="flex flex-wrap gap-2">
        {SEED_ADDRESSES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => void check(candidate)}
            className={
              "rounded-full border px-3 py-1 font-mono text-xs " +
              (candidate === address
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-muted")
            }
          >
            {candidate}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="security-address">
          IP address to check
        </label>
        <input
          id="security-address"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          value={address}
          maxLength={MAX_ADDRESS_CHARS}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void check(address)}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Checking…" : "Check"}
        </button>
      </div>
      {result ? (
        <p className="font-mono text-sm">
          {result.kind === "network-error"
            ? `network error: ${result.message}`
            : result.kind === "error"
              ? `HTTP ${result.status}`
              : result.blocked
                ? "BLOCKED"
                : "allowed"}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        DNS-free — no fetch is ever performed by this check. It evaluates the same pure predicate{" "}
        <code className="font-mono">isBlockedAddress</code> that gates
        <code className="font-mono"> safeFetch</code>&rsquo;s DNS-resolved address before a
        connection is attempted.
      </p>
    </LiveExample>
  );
}
