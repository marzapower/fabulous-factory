// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useState } from "react";

import { DumpPanel } from "@/components/workspace/dump-panel";

/**
 * The one thing Untangle does that a to-do app doesn't, shown rather than claimed: your
 * note stays on screen and gets visibly consumed, so "what did it miss?" is answered by
 * looking instead of by comparing two lists.
 *
 * This renders the REAL `DumpPanel` — the same component the signed-in workspace uses —
 * in its read-only mode, over a fixed note. No `onCreateFromLeftover`, because there is
 * no capture row here to attach a manual task to; the panel drops the click affordance
 * and the "click it to add one" caption accordingly instead of dangling a dead control.
 */

const NOTE =
  `pick up the dry cleaning, ticket is in the car\n` +
  `honestly not sure the pricing page is the problem\n` +
  `renew the domain before it lapses\n` +
  `keep meaning to reread that essay on scope`;

/**
 * Offsets are looked up rather than hand-counted — a literal number would silently drift
 * the moment anyone edits a character of `NOTE`. The throw is the point: this runs at
 * module scope, so a quote that stops matching fails the build (and `next dev`'s first
 * render) instead of quietly rendering a highlight over the wrong words.
 */
function span(id: string, title: string, quote: string) {
  const start = NOTE.indexOf(quote);
  if (start < 0) {
    throw new Error(`nothing-disappears: “${quote}” is not a substring of NOTE`);
  }
  return { id, title, sourceStart: start, sourceEnd: start + quote.length };
}

const CONSUMED = [
  span("t1", "Pick up the dry cleaning", "pick up the dry cleaning"),
  span("t2", "Renew the domain", "renew the domain before it lapses"),
];

export function NothingDisappears() {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  return (
    <section className="fab-consume border-y border-border bg-muted/20">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-5">
          <h2 className="text-3xl font-bold tracking-tight text-balance text-foreground">
            Nothing you wrote disappears
          </h2>
          <p className="text-lg text-muted-foreground">
            Your note stays on the page the whole time. As each task is lifted out, the words it
            came from fade — so the note reads as a record of what was picked up.
          </p>
          <p className="text-lg text-muted-foreground">
            Whatever is still bright was left alone. Sometimes that&rsquo;s right, and it was never
            a task &mdash; the aside above is not something to do. Sometimes it isn&rsquo;t, and in
            the app one click turns it into a task.
          </p>
        </div>

        <DumpPanel
          text={NOTE}
          tasks={CONSUMED}
          hoveredTaskId={hoveredTaskId}
          onHoverTask={setHoveredTaskId}
        />
      </div>
    </section>
  );
}
