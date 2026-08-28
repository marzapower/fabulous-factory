// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { AuthFeaturePage, type AuthSourceExample } from "@factory/ui/features";
import { featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const meta = featureMeta(t, "auth");
  return { title: meta.title, description: meta.blurb };
}

// OAuth button visibility (and the status row below) is a runtime, server-side fact —
// never guessed client-side (design spec §5.1), same reason the login page itself is
// force-dynamic.
export const dynamic = "force-dynamic";

// Real, current source (K.16 truth sweep) — this preset's own auth-gated action, not
// untangle's toggleTaskAction (this preset has no task list).
const sourceExample: AuthSourceExample = {
  heading: "Real source",
  snippet: `export const setItemStatusAction = defineAction({
  auth: "required",
  input: itemIdInput.extend({ status: z.enum(["accepted", "dismissed"]) }),
  action: async ({ session, input }) => {
    const updated = await updateItemForUser(input.itemId, session.user.id, {
      status: input.status,
    });
    if (!updated) {
      throw new ApiError(404, "item_not_found", "That item is gone already.");
    }
    return updated;
  },
});`,
  caption: "apps/web/app/projects/[id]/actions.ts — setItemStatusAction",
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);

  return (
    <AuthFeaturePage brand="Fabulous Brainstorm Chat" emoji="💭" sourceExample={sourceExample} />
  );
}
