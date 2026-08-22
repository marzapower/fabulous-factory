// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { PriorityChip } from "@/components/workspace/priority-chip";

/**
 * The product explained by watching ONE task travel through it. Each column shows the
 * same task at the end of that pass, so the artifact visibly accumulates left to right:
 * a raw line becomes a task, the task gains a when, the task grows the two steps it was
 * hiding. No due date is shown: the replayed task (`recorded-run.ts`'s rr-3) genuinely
 * has `dueAt: null`, and inventing one here to make the column look richer is exactly
 * the drift this fixture-anchoring exists to prevent.
 *
 * The numbering is not decoration — `extract → triage → decompose` is the literal step
 * list `capturePipeline` runs (`packages/untangle/src/tasks/pipeline.ts`), in that order, and
 * a run that stops halfway stops between these columns. Order carries information here,
 * so it is stated.
 *
 * Like `hero.tsx` this reaches into `@/components/workspace/` for `PriorityChip` rather
 * than restyling a chip locally: there must be exactly one definition of what `now` looks
 * like, or the landing page starts lying about the product by drifting away from it.
 */

/**
 * `TASK_TITLE` and `SUBTASKS` are the real output of the run replayed in the hero, not a
 * plausible-looking invention: `recorded-run.ts` extracts exactly this title from the
 * line "staging deploy keeps timing out around 2am…", triages it `now`, and decomposes it
 * into exactly these two children. The section's intro says "one line of that note", so
 * it has to be a line of that note.
 */
const TASK_TITLE = "Investigate the staging deploy timeouts";
const SUBTASKS = ["Check the 2am cron overlap window", "Add an alert for deploy timeouts"];

function Card({
  priority,
  children,
}: {
  priority: "now" | "next" | "later" | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <span className="text-sm font-medium text-foreground">{TASK_TITLE}</span>
        <PriorityChip priority={priority} />
      </div>
      {children}
    </div>
  );
}

function Pass({
  index,
  title,
  body,
  children,
}: {
  index: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-rows-[auto_auto_1fr] gap-4">
      <div className="flex items-baseline gap-3">
        <span aria-hidden="true" className="font-mono text-sm text-fab-marker">
          {index}
        </span>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="pt-2">{children}</div>
    </li>
  );
}

export function ThreePasses() {
  return (
    <section className="fab-passes mx-auto max-w-6xl px-6 py-20">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-foreground">
        Three passes over your words
      </h2>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Watch one line of that note become one task, in order. Each pass adds something the pass
        before it couldn&rsquo;t know yet.
      </p>

      <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <Pass
          index="01"
          title="Pull out the tasks"
          body="Untangle reads the whole note and lifts out the lines that are actually something to do. Asides, moods and half-thoughts are left where they are."
        >
          <Card priority={null} />
        </Pass>

        <Pass
          index="02"
          title="Say when it matters"
          body="Now, next or later, read out of your own wording. A deadline you wrote in passing becomes a real due date; “sometime” stays undated, because it is."
        >
          <Card priority="now" />
        </Pass>

        <Pass
          index="03"
          title="Break down what's too big"
          body="A task you can't start in one sitting comes back as the two or three you can. The original stays; the steps hang off it."
        >
          <Card priority="now">
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {SUBTASKS.map((child) => (
                <li key={child} className="ml-6 border-l border-border pl-3">
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
                    {child}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Pass>
      </ol>
    </section>
  );
}
