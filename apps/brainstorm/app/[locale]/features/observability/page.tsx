// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { ObservabilityFeaturePage } from "@factory/ui/features";
import { featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const meta = featureMeta(t, "observability");
  return { title: meta.title, description: meta.blurb };
}

// Capability-conditional UI (design spec §5.1) — both status lights below read a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

// K.16 truth sweep: this page previously carried untangle's verbatim copy ("untangling a
// dump emits analytics events under the hood") — false here, this preset has no dump to
// untangle. Grepped `track(` across apps/brainstorm and packages/brainstorm: zero real
// call sites, same as "nothing". Rewritten to the honest pattern-not-yet-wired note.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);

  return (
    <ObservabilityFeaturePage
      brand="Fabulous Brainstorm Chat"
      emoji="💭"
      closingNote={
        <>
          This preset ships no feature that calls <code className="font-mono">track()</code> yet —
          once one does (an accepted proposal landing on the board, say), set both keys and it
          starts reporting; unset them and the same call sites keep running exactly the same, just
          quietly doing nothing.
        </>
      }
    />
  );
}
