// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { CodeBlock } from "@/components/marketing/code-block";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";

import { SecurityBlocklistDemo } from "./blocklist-demo";

export const metadata: Metadata = {
  title: FEATURES.security.title,
  description: FEATURES.security.blurb,
};

const isBlockedAddressSnippet = `export function isBlockedAddress(
  address: string,
  denyList: net.BlockList = DEFAULT_DENY_LIST,
): boolean {
  const unmapped = unmapIPv4(address);
  if (net.isIPv4(unmapped)) {
    return denyList.check(unmapped, "ipv4");
  }
  if (net.isIPv6(unmapped)) {
    return denyList.check(unmapped, "ipv6");
  }
  // A resolved-but-unparseable address is denied by default — fail closed on the one
  // input this function cannot classify.
  return true;
}`;

const postConnectSnippet = `function createValidatingConnector(isBlocked: (address: string) => boolean) {
  const connect = buildConnector({ timeout: DEFAULT_TIMEOUT_MS });
  return (options, callback) => {
    connect(options, (err, socket) => {
      if (err) return callback(err, null);
      // The ACTUAL socket the connection landed on is checked here — not the
      // pre-resolved DNS answer. This is what defeats DNS-rebinding TOCTOU: DNS could
      // have pointed somewhere safe at lookup time and somewhere blocked by connect time.
      const remoteAddress = socket.remoteAddress;
      if (!remoteAddress || isBlocked(remoteAddress)) {
        socket.destroy();
        return callback(new SafeFetchError("blocked_address", ...), null);
      }
      callback(null, socket);
    });
  };
}`;

export default function SecurityFeaturePage() {
  return (
    <FeaturePageShell feature={FEATURES.security}>
      <section>
        <h2 className="text-xl font-semibold">What it does</h2>
        <p className="mt-2 text-muted-foreground">
          From a feature&rsquo;s side: any code that needs to fetch a URL the user supplied calls{" "}
          <code className="font-mono">safeFetch()</code> instead of the global{" "}
          <code className="font-mono">fetch</code>, and gets SSRF protection for free — no
          per-feature range-checking code to get wrong.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">The rule it enforces</h2>
        <p className="mt-2 text-muted-foreground">
          A user-supplied URL can point at a hostname that resolves safely at DNS-lookup time and
          somewhere internal (a cloud metadata endpoint, a private-network service) by the time the
          connection actually lands — DNS-rebinding. The rule
          <code className="font-mono">safeFetch</code> enforces is: never trust the pre-connect DNS
          answer. Validate the socket you actually got.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Real source</h2>
        <p className="mt-2 text-muted-foreground">
          The pure predicate the live example below calls — an IP-range check, nothing more:
        </p>
        <CodeBlock
          code={isBlockedAddressSnippet}
          caption="packages/core/src/safe-fetch.ts — isBlockedAddress()"
        />
        <p className="mt-4 text-muted-foreground">
          The actual defense against DNS-rebinding is the post-connect check that calls this
          predicate against the real, connected socket, not the DNS answer:
        </p>
        <div className="mt-2">
          <CodeBlock
            code={postConnectSnippet}
            caption="packages/core/src/safe-fetch.ts — createValidatingConnector()"
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">A working example</h2>
        <p className="mt-2 text-muted-foreground">
          <code className="font-mono">isBlockedAddress</code> takes an IP address literal, not a
          hostname — it fails closed (blocked) for anything that isn&rsquo;t a valid IPv4/IPv6
          literal, which is why the field below takes an IP, not a URL. This is DNS-free: no lookup,
          no fetch is ever performed by this page.
        </p>
        <div className="mt-4">
          <SecurityBlocklistDemo />
        </div>
      </section>
    </FeaturePageShell>
  );
}
