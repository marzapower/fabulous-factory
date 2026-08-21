// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const generateSnippet = `if (isEnabled("llm")) {
  try {
    const result = await generate({
      task: MONITOR_SUMMARY_TASK,
      context: [untrusted(oldExcerpt), untrusted(newExcerpt)],
      quality: "cheap",
      maxCostCents: 5,
      promptId: "monitor-summary",
      maxOutputTokens: 256,
    });
    summary = result.output.slice(0, MAX_SUMMARY_CHARS);
  } catch (error) {
    // A summary failure must not fail the check — the feed keeps its diff summary.
    captureException(error, { monitorId, stage: "monitor-summary" });
  }
}`;

export default function LlmFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.llm.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.llm} statusSlot={<StatusLight service="llm" />}>
        <section>
          <h2 className="text-xl font-semibold">What you get</h2>
          <p className="mt-2 text-muted-foreground">
            One <code className="font-mono">generate()</code> call, built on the Vercel AI SDK, that
            routes to whichever profile is configured: a local model over Ollama, OpenRouter, or a
            direct Anthropic/OpenAI key. Every call picks a quality tier — cheap, balanced, or high
            — and can carry a hard cost ceiling in cents. Swapping providers is an env change, never
            a call-site rewrite.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How it works here</h2>
          <p className="mt-2 text-muted-foreground">
            The demo monitor pipeline only spends an LLM call when a page&rsquo;s content hash
            actually changed — never on a routine, unchanged check. Even then, a failed or disabled
            call degrades to a plain diff summary instead of blocking the result.
          </p>
          <CodeBlock
            code={generateSnippet}
            caption="packages/jobs/src/demo/check-monitor.ts — the LLM upgrade step"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Set credentials for any one profile — OpenRouter, a direct provider key, or a local
            server URL — and it lights up (checked in that order unless{" "}
            <code className="font-mono">LLM_PROFILE</code> forces one explicitly). Leave all of it
            unset and <code className="font-mono">generate()</code> throws before any provider SDK
            is even loaded; every call site is written to fall back to a non-AI result rather than
            let that throw reach a user.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Try it</h2>
          <p className="mt-2 text-muted-foreground">
            Add a monitor in the dashboard and watch the feed summarize a change once it fires.
            Without an LLM profile configured, you still get the change — just as a raw diff instead
            of a sentence.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
