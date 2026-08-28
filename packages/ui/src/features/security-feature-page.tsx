// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { CodeBlock, FeaturePageShell, featureMeta } from "../marketing";
import { SecurityBlocklistDemo } from "./blocklist-demo";

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

export function SecurityFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const t = useTranslations("ui.featurePages.security");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");

  return (
    <FeaturePageShell feature={featureMeta(tf, "security")} brand={brand} emoji={emoji}>
      <section>
        <h2 className="text-xl font-semibold">{tc("whatItDoes")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("whatItDoesBody", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("ruleItEnforces")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("ruleBody", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("realSource")}</h2>
        <p className="mt-2 text-muted-foreground">{t("realSourceIntro")}</p>
        <CodeBlock
          code={isBlockedAddressSnippet}
          caption="packages/core/src/safe-fetch.ts — isBlockedAddress()"
        />
        <p className="mt-4 text-muted-foreground">{t("realSourceIntro2")}</p>
        <div className="mt-2">
          <CodeBlock
            code={postConnectSnippet}
            caption="packages/core/src/safe-fetch.ts — createValidatingConnector()"
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("workingExampleBody", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
        <div className="mt-4">
          <SecurityBlocklistDemo />
        </div>
      </section>
    </FeaturePageShell>
  );
}
