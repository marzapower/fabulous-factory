// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { LiveExample } from "@/components/marketing/live-example";
import { StatusLight } from "@/components/marketing/status-light";

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

export default function LlmFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.llm.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.llm} statusSlot={<StatusLight service="llm" />}>
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: <code className="font-mono">streamArray()</code> takes a zod
            schema for ONE array element and hands your code a fully-typed element every time the
            model completes one — no partial objects, no vendor SDK types leaking out of{" "}
            <code className="font-mono">@factory/llm</code>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            Every call — streaming or not — goes through the same budget check, cost accounting, and{" "}
            <code className="font-mono">llm_calls</code> row, whichever provider profile is
            configured (local, OpenRouter, or a direct key). A call site never spends money it
            wasn&rsquo;t told it could, and a disabled or over-budget call throws before any
            provider SDK is even loaded.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <CodeBlock
            code={streamArraySnippet}
            caption="packages/brainstorm/src/turn.ts — runBrainstormTurn"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            A live call here would spend money on anonymous traffic and would be dead on a keyless
            clone — so this shows the exact SSE frames a real turn writes, not a live one.
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title="One turn's SSE frames, verbatim">
              <CodeBlock
                code={turnFramesSnippet}
                caption="POST /api/chat — one say chunk, one proposal, then turn-finished"
                copy={false}
              />
            </LiveExample>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Set credentials for any one profile and it lights up. Leave all of it unset and{" "}
            <code className="font-mono">streamArray()</code>/
            <code className="font-mono">generate()</code> throw before any provider SDK loads; every
            call site in this template is written to fall back to a non-AI result rather than let
            that throw reach a user.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
