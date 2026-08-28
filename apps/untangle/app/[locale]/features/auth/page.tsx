// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { AuthFeaturePage, type AuthSourceExample } from "@factory/ui/features";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features.auth");
  return { title: t("title"), description: t("blurb") };
}

// OAuth button visibility (and the status row below) is a runtime, server-side fact —
// never guessed client-side (design spec §5.1), same reason the login page itself is
// force-dynamic.
export const dynamic = "force-dynamic";

// Real, current source (K.16 truth sweep) — this preset's own auth-gated action.
const sourceExample: AuthSourceExample = {
  heading: "Real source",
  snippet: `export const toggleTaskAction = defineAction({
  auth: "required",
  input: taskIdInput.extend({ status: z.enum(["open", "done"]) }),
  action: async ({ session, input }) => {
    const updated = await setTaskStatus(input.id, session.user.id, input.status);
    if (!updated) {
      throw new ApiError(404, "task_not_found", "That task is gone already.");
    }
    return { id: input.id, status: input.status } as const;
  },
});`,
  caption: "apps/web/app/dashboard/actions.ts — toggleTaskAction",
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <AuthFeaturePage brand="Fabulous Untangle" emoji="🧶" sourceExample={sourceExample} />;
}
