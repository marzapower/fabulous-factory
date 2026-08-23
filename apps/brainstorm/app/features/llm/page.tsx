// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { LlmFeaturePage } from "@factory/ui/features";
import { CodeBlock, FEATURES, LiveExample } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.llm.title,
  description: FEATURES.llm.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const streamArraySnippet = `const proposals = [];

const result = await streamArray({
  task: buildTurnTask(),
  context: buildTurnContext({ projectName, pitch, history, items, userText }),
  element: turnElementSchema,
  quality: "balanced",
  maxOutputTokens: TURN_MAX_OUTPUT_TOKENS,
  maxCostCents: TURN_MAX_COST_CENTS,

  // SYNCHRONOUS ONLY. streamArray does not await this, so anything
  // async here could still be in flight when the call resolves.
  // Mint an id and emit — the card appears the instant the model
  // produces it. That is the whole point of streaming.
  onElement: (element, index) => {
    const event = mapTurnElement(element, index, () => crypto.randomUUID());
    if (!event) return;
    if (event.type === "proposal") proposals.push(event.proposal);
    emit(event);
  },
});

// Persist AFTER the stream resolves, under the ids already minted above —
// fully awaited, no race, and the UI never reconciles a temporary key.
for (const proposal of proposals) {
  await createItemForUser(projectId, userId, { id: proposal.id, ...proposal, source: "ai", status: "proposed" });
}`;

const turnFramesSnippet = `data: {"type":"turn-started"}

data: {"type":"say","text":"A shared grocery list sounds sharp — what should the first screen show?","index":0}

data: {"type":"proposal","proposal":{"id":"5b1c…","kind":"feature","title":"Real-time list sync","detail":"Every household member sees edits instantly."},"index":1}

data: {"type":"turn-finished","status":"ok","costCents":1}`;

export default function Page() {
  return (
    <LlmFeaturePage
      brand="Fabulous Brainstorm Chat"
      emoji="💭"
      sourceSnippet={streamArraySnippet}
      sourceCaption="packages/brainstorm/src/turn.ts — runBrainstormTurn"
      exampleIntro={
        <>
          A live call here would spend money on anonymous traffic and would be dead on a keyless
          clone — so this shows the exact SSE frames a real turn writes, not a live one.
        </>
      }
      exampleContent={
        <LiveExample kind="static" title="One turn's SSE frames, verbatim">
          <CodeBlock
            code={turnFramesSnippet}
            caption="POST /api/chat — one say chunk, one proposal, then turn-finished"
            copy={false}
          />
        </LiveExample>
      }
    />
  );
}
