import { Card, CardContent, CardHeader } from "@factory/ui/primitives";

/**
 * Mirrors `page.tsx`'s real layout: the "Runs" header + back link, then a list of run
 * cards (title/status row, meta line, mono step rows) — this route awaits
 * `listRunsForUser` + a `getRunForUser` per row before it can render anything, so a
 * shaped skeleton beats a blank page while those resolve. `motion-safe:animate-pulse` is
 * Tailwind's own reduced-motion-aware variant.
 */
export default function RunsLoading() {
  return (
    <main className="fab-shell mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-20 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
      </div>

      <ul className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <li key={index}>
            <Card>
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-muted motion-safe:animate-pulse" />
                </div>
                <div className="h-3 w-56 rounded-md bg-muted motion-safe:animate-pulse" />
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {Array.from({ length: 3 }).map((__, stepIndex) => (
                  <div
                    key={stepIndex}
                    className="h-3 w-full rounded-md bg-muted motion-safe:animate-pulse"
                  />
                ))}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
