import { requireSession } from "@factory/auth";
import { listProjectsForUser } from "@factory/brainstorm";

import { NewProjectForm } from "@/components/dashboard/new-project-form";
import { ProjectCard } from "@/components/dashboard/project-card";
import { SignOutButton } from "@factory/ui/auth";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";
import { ThemeToggle } from "@factory/ui/theme";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession({ redirectTo: "/login" });
  const projects = await listProjectsForUser(session.user.id);

  return (
    <>
      <main className="fab-shell mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Your projects</CardTitle>
            <CardDescription>Signed in as {session.user.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Welcome{session.user.name ? `, ${session.user.name}` : ""}.
            </p>
            {/* This dashboard doesn't render SiteHeader (it has its own top bar via
                this Card), so the toggle lands here instead — the only reachable spot
                for someone who lands straight on /dashboard without visiting "/". */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </CardContent>
        </Card>

        <NewProjectForm autoFocus={projects.length === 0} />

        {projects.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            No projects yet — name the thing you&rsquo;re circling.
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
