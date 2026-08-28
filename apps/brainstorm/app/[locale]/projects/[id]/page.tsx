import { notFound } from "next/navigation";

import { localizedHref, setRequestLocale } from "@factory/i18n/server";

import { requireSession } from "@factory/auth";
import {
  getProjectForUser,
  listItemsForProject,
  listMessagesForProject,
} from "@factory/brainstorm";
import { getClientConfig, isEnabled } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { ProjectHeader } from "@/components/workbench/project-header";
import { Workbench } from "@/components/workbench/workbench";
import { SiteFooter } from "@factory/ui/marketing";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session + ownership lookup besides — never statically
// prerendered.
export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  // packages/auth is untouched by the i18n plan — requireSession keeps its bare
  // "/login" default; this page passes a localized redirectTo instead. The proxy
  // already bounces an unauthenticated request to the locale-appropriate /login before
  // it ever reaches this page.
  const session = await requireSession({ redirectTo: await localizedHref("/login") });

  const project = await getProjectForUser(id, session.user.id);
  if (!project) {
    notFound();
  }

  const [messages, items] = await Promise.all([
    listMessagesForProject(project.id, session.user.id),
    listItemsForProject(project.id, session.user.id),
  ]);
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <div className="flex min-h-svh flex-col">
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
          <ProjectHeader projectId={project.id} name={project.name} pitch={project.pitch} />

          <Workbench
            project={project}
            messages={messages}
            items={items}
            llmEnabled={isEnabled("llm")}
          />
        </main>

        <SiteFooter />
      </div>
    </ClientConfigProvider>
  );
}
