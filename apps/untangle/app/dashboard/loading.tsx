import { Card, CardContent, CardHeader } from "@factory/ui/primitives";

/**
 * Mirrors `page.tsx`'s real layout: profile card, the Today's-plan card, the workspace
 * composer block, then the capability panel's list. `motion-safe:animate-pulse` is
 * Tailwind's own reduced-motion-aware variant — no custom keyframe needed.
 */
export default function DashboardLoading() {
  return (
    <main className="fab-shell mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="gap-2">
          <div className="h-6 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-48 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="h-4 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="h-8 w-20 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="h-5 w-28 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-4 w-full rounded-md bg-muted motion-safe:animate-pulse" />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="h-5 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-24 w-full rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
        </CardContent>
      </Card>

      <section className="mt-2">
        <div className="mb-3 h-5 w-28 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 w-full rounded-md bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      </section>
    </main>
  );
}
