import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { requireSession } from "@factory/auth";
import { listProjectsForUser } from "@factory/brainstorm";

import { NewProjectForm } from "@/components/dashboard/new-project-form";
import { ProjectCard } from "@/components/dashboard/project-card";
import { DashboardTopBar } from "@factory/ui/dashboard";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  // getTranslations, not useTranslations: this default export is an async Server
  // Component, and next-intl's sync hook is only callable from a non-async component
  // (https://next-intl.dev/docs/environments/server-client-components#async-components).
  const t = await getTranslations("app.dashboard");
  // requireSession's redirectTo stays the bare, unlocalized "/login" (packages/auth is
  // untouched by the i18n plan) — the proxy already bounces an unauthenticated request
  // to the locale-appropriate /login before it ever reaches this page; this is a
  // defense-in-depth fallback, not the primary redirect path.
  const session = await requireSession({ redirectTo: "/login" });
  const projects = await listProjectsForUser(session.user.id);

  return (
    <>
      <main className="fab-shell mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("signedInAs", { email: session.user.email })}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {session.user.name ? t("welcomeNamed", { name: session.user.name }) : t("welcome")}
            </p>
            <DashboardTopBar userEmail={session.user.email} settingsHref="/settings" />
          </CardContent>
        </Card>

        <NewProjectForm autoFocus={projects.length === 0} />

        {projects.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("noProjects")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
