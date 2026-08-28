import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { Link } from "@factory/i18n/navigation";

// Static prose page (design spec shell idiom): no capability reads, no client state — a
// plain server component, matching apps/web/app/page.tsx's container/typography classes.
// Placeholder content only — the `make-it-yours` skill covers replacing it (M9, §J.6).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.meta.privacy");
  // Bare page name: the root layout's "%s · Fabulous Nothing" template supplies
  // the product name, so hardcoding one here would double it — and hardcoding
  // the TEMPLATE's name on the product's own legal page was simply wrong.
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.legal.privacy");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{t("lastUpdated")}</p>

      <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        {t.rich("placeholderNotice", {
          code: (chunks) => <code className="text-foreground">{chunks}</code>,
        })}
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">
            {t("sections.dataCollected.title")}
          </h2>
          <p className="mt-2">{t("sections.dataCollected.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">{t("sections.cookies.title")}</h2>
          <p className="mt-2">{t("sections.cookies.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            {t("sections.thirdParties.title")}
          </h2>
          <p className="mt-2">{t("sections.thirdParties.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">{t("sections.contact.title")}</h2>
          <p className="mt-2">{t("sections.contact.body")}</p>
        </section>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          {t("backToHome")}
        </Link>
      </p>
    </main>
  );
}
