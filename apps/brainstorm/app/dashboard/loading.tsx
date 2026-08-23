import { Card, CardContent, CardHeader } from "@factory/ui/primitives";

/**
 * Mirrors `app/dashboard/page.tsx`'s real layout (profile card, new-project affordance,
 * a grid of project cards) so the skeleton never jumps in shape once data lands.
 * `motion-safe:animate-pulse` is Tailwind's own reduced-motion-aware variant — no custom
 * keyframe needed, and it collapses to a static block under `prefers-reduced-motion`.
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="gap-2">
          <div className="h-6 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-56 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="h-4 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="h-8 w-20 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardContent>
      </Card>

      <div className="h-9 w-32 rounded-md bg-muted motion-safe:animate-pulse" />

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <div className="h-5 w-3/4 rounded-md bg-muted motion-safe:animate-pulse" />
              <div className="h-4 w-full rounded-md bg-muted motion-safe:animate-pulse" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}
