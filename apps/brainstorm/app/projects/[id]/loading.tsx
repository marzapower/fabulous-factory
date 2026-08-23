/**
 * Mirrors `page.tsx`'s real layout: a title/pitch header, then the workbench's
 * chat-pane / board-pane split (`components/workbench/workbench.tsx`'s `lg:grid-cols-12`
 * 7/5 split). Board sections ("Pending", "Ideas", "Features", "Notes") are named here
 * too — this route is gated on a live session + ownership lookup (`force-dynamic`), so a
 * visible skeleton beats a blank pane while that resolves.
 * `motion-safe:animate-pulse` is Tailwind's own reduced-motion-aware variant.
 */
export default function ProjectLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <header className="flex flex-col gap-2">
        <div className="h-8 w-64 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-80 rounded-md bg-muted motion-safe:animate-pulse" />
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="flex min-h-[28rem] flex-col gap-3 lg:col-span-7">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-16 w-4/5 rounded-lg border border-bench-line bg-bench-paper motion-safe:animate-pulse"
              style={index % 2 === 1 ? { alignSelf: "flex-end" } : undefined}
            />
          ))}
        </section>

        <section className="flex flex-col gap-6 lg:col-span-5">
          {["Ideas", "Features", "Notes"].map((label) => (
            <div key={label} className="flex flex-col gap-2">
              <h2 className="font-display text-sm font-medium text-bench-ink">{label}</h2>
              <div className="h-10 w-full rounded-md border border-bench-line bg-bench-paper motion-safe:animate-pulse" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
