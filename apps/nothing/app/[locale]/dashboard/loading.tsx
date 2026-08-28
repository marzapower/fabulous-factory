import { Card, CardContent, CardHeader } from "@factory/ui/primitives";

/**
 * Mirrors `page.tsx`'s real layout: profile card, `CapabilityPanel`'s list of services,
 * then the empty-state "Dashboard" card. `motion-safe:animate-pulse` is Tailwind's own
 * reduced-motion-aware variant — no custom keyframe needed.
 */
export default function DashboardLoading() {
  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
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

        <section className="mt-2">
          <div className="mb-3 h-5 w-28 rounded-md bg-muted motion-safe:animate-pulse" />
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-9 w-full rounded-md bg-muted motion-safe:animate-pulse"
              />
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <div className="h-5 w-24 rounded-md bg-muted motion-safe:animate-pulse" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="h-4 w-full rounded-md bg-muted motion-safe:animate-pulse" />
            <div className="h-4 w-3/4 rounded-md bg-muted motion-safe:animate-pulse" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
