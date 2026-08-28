// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { LocaleSwitcher } from "../locale-switcher";

export function SiteFooter() {
  const t = useTranslations("ui.marketing.siteFooter");

  return (
    <footer className="fab-footer border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <nav aria-label={t("legalNavLabel")} className="flex items-center gap-4">
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            {t("privacy")}
          </Link>
          <LocaleSwitcher />
        </nav>

        <p>
          {t("builtWith")}{" "}
          <a
            href="https://github.com/marzapower/fabulous-factory"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("factoryLinkText")}
          </a>
        </p>
      </div>
    </footer>
  );
}
