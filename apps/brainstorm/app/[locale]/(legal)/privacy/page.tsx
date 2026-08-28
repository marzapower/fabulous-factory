import type { Metadata } from "next";

import { Link } from "@factory/i18n/navigation";
import { getTranslations, setRequestLocale } from "@factory/i18n/server";

// Static prose page (design spec shell idiom): no capability reads, no client state — a
// plain server component, matching apps/web/app/page.tsx's container/typography classes.
// Placeholder content only — the `make-it-yours` skill covers replacing it (M9, §J.6).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app.meta.privacy" });
  // Bare page name: the root layout's "%s · Fabulous Brainstorm Chat" template supplies
  // the product name, so hardcoding one here would double it — and hardcoding the
  // TEMPLATE's name on the product's own legal page was simply wrong.
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  // getTranslations, not useTranslations: this default export is an async Server
  // Component, and next-intl's sync hook is only callable from a non-async component
  // (https://next-intl.dev/docs/environments/server-client-components#async-components).
  const t = await getTranslations("app.legal");
  const tp = await getTranslations("app.legal.privacy");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t("privacyTitle")}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{t("lastUpdated")}</p>

      <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        {t.rich("placeholderNotice", {
          code: (chunks) => <code className="text-foreground">{chunks}</code>,
        })}
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">{tp("section1.title")}</h2>
          <p className="mt-2">{tp("section1.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">{tp("section2.title")}</h2>
          <p className="mt-2">{tp("section2.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">{tp("section3.title")}</h2>
          <p className="mt-2">{tp("section3.body")}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">{tp("section4.title")}</h2>
          <p className="mt-2">{tp("section4.body")}</p>
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
