// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { initialWorkspaceState, runReducer } from "@/components/workspace/run-reducer";
import { RunStrip } from "@/components/workspace/run-strip";

import { deriveHeuristicRun, RECORDED_RUN } from "./recorded-run";

// Both columns below are folded from the SAME `RECORDED_RUN` array (K.16 R4) —
// `deriveHeuristicRun` computes the heuristic side FROM the LLM side, so "identical
// steps" is a structural fact this module enforces, not a claim two hand-authored
// fixtures could quietly drift apart on.
const llmFinalState = RECORDED_RUN.reduce(runReducer, initialWorkspaceState);
const heuristicFinalState = deriveHeuristicRun(RECORDED_RUN).reduce(
  runReducer,
  initialWorkspaceState,
);

export function DegradationStrip() {
  return (
    <section className="fab-degradation border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">// the same run, twice</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Unset the LLM key and it still runs
          </h2>
          <p className="mt-3 text-muted-foreground">
            Same recorded run, same three steps, same tasks. With a key, extraction and triage are{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              source: llm
            </code>
            . Without one, they fall back to{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              source: heuristic
            </code>{" "}
            — and the step that has no heuristic stand-in (breaking a task down further) reports{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              skipped
            </code>{" "}
            rather than inventing an answer.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              With an LLM key
            </h3>
            <RunStrip
              runId={llmFinalState.runId}
              steps={llmFinalState.steps}
              totalCostCents={llmFinalState.totalCostCents}
              live={false}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              Without one
            </h3>
            <RunStrip
              runId={heuristicFinalState.runId}
              steps={heuristicFinalState.steps}
              totalCostCents={heuristicFinalState.totalCostCents}
              live={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
