// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { LlmFeaturePage } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";
import { RECORDED_RUN } from "@/components/marketing/recorded-run";

import { RunReplay } from "../run-replay";

export const metadata: Metadata = {
  title: FEATURES.llm.title,
  description: FEATURES.llm.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const streamArraySnippet = `const streamed = [];

const result = await streamArray({
  task: EXTRACT_TASK,
  context: [\`Today's date: \${state.todayIso}\`, untrusted(state.rawText)],
  element: extractElementSchema,
  maxCostCents: EXTRACT_MAX_COST_CENTS,
  maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
  promptId: "tasks-extract",

  // SYNCHRONOUS ONLY. streamArray does not await this, so anything
  // async here could still be in flight when the call resolves.
  // Mint an id and emit — the card appears the instant the model
  // produces it. That is the whole point of streaming.
  onElement: (element) => {
    const id = randomUUID();
    streamed.push({ id, title: element.title.trim() });
    ctx.emit({ type: "data", payload: { kind: "task-added", id, ... } });
  },
});

// Persist AFTER the stream resolves, under the ids already emitted —
// fully awaited, no race, and the UI never reconciles a temporary key.
// Deliberately outside the try that falls back to the heuristic: a failed
// insert must fail the run, not re-extract on top of committed rows.
for (const item of streamed) {
  await insertExtractedTask({ id: item.id, ... });
}`;

export default function Page() {
  return (
    <LlmFeaturePage
      brand="Fabulous Untangle"
      emoji="🧶"
      sourceSnippet={streamArraySnippet}
      sourceCaption="packages/untangle/src/tasks/pipeline.ts — extractStep"
      exampleIntro={
        <>
          A live call here would spend money on anonymous traffic and would be dead on a keyless
          clone — so this replays a recorded run instead of making a real one.
        </>
      }
      exampleContent={<RunReplay events={RECORDED_RUN} title="Recorded streamArray extraction" />}
    />
  );
}
