// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

/**
 * A static two-column comparison (K.16-style "the same feature, twice" strip, adapted for
 * this preset): the brainstorm chat surface degrades HARD, not gracefully — with no LLM
 * key, `assertLlmChatEnabled` throws before a turn ever starts, so there is no heuristic
 * stand-in to show side by side the way an extraction-style pipeline has one. What
 * degrades gracefully instead is the PRODUCT as a whole: the board (projects, ideas,
 * features, notes — all manual CRUD) is fully independent of the LLM capability and never
 * reads it. Both columns below are plain static markup, not a replayed event stream — this
 * component makes no server call and derives nothing from live state.
 */
export function DegradationStrip() {
  return (
    <section className="fab-degradation border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">// the same board, either way</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Unset the LLM key and the board still works
          </h2>
          <p className="mt-3 text-muted-foreground">
            Chat is the one piece that needs an LLM — with no key,{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              assertLlmChatEnabled
            </code>{" "}
            refuses the turn honestly (503{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              llm_disabled
            </code>
            ) rather than pretending to brainstorm with you. Everything else on this page — adding,
            editing, accepting, dismissing a board item — never touches the LLM capability at all.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              With an LLM key
            </h3>
            <p className="text-sm text-muted-foreground">
              Say something in the chat pane, get prose back plus proposal cards you accept or
              dismiss onto the board.
            </p>
            <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-border bg-background p-3 font-mono text-xs">
              <span className="text-muted-foreground">you: a shared grocery list app</span>
              <span>assistant: real-time sync would make it click.</span>
              <span className="text-spark">+ feature — real-time list sync</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              Without one
            </h3>
            <p className="text-sm text-muted-foreground">
              The chat pane is replaced by an honest notice. The board — every idea, feature and
              note you&rsquo;ve already accepted — renders exactly the same either way.
            </p>
            <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
              <span>Chat needs an LLM key — see /features/llm.</span>
              <span>Your board still works.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
