import { notFound } from "next/navigation";

import { requireSession } from "@factory/auth";
import {
  getProjectForUser,
  listItemsForProject,
  listMessagesForProject,
} from "@factory/brainstorm";
import { getClientConfig, isEnabled } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { Workbench } from "@/components/workbench/workbench";
import { SiteFooter } from "@/components/marketing/site-footer";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session + ownership lookup besides — never statically
// prerendered.
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession({ redirectTo: "/login" });

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
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            {project.pitch ? <p className="text-muted-foreground">{project.pitch}</p> : null}
          </header>

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
