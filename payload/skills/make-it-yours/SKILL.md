---
name: make-it-yours
description: The umbrella skill for owning every remaining open LAUNCH.md item. Walks LAUNCH.md item by item, including the rename-the-domain recipe for the Untangle workspace, the template-showcase removal, and the legal-pages and README items. Use whenever you or the human ask "what's left to make this mine?"
---

# Make it yours

## Phase 1 — Survey

```bash
pnpm factory:status
```

Renders `LAUNCH.md`: one line per item, open vs. done, and which skill owns each open
one. `Product definition` → `define-product`; `App identity`/`Design system`/
`Email templates` → `brand-it`; `Plans catalog` → `enable-billing`. This skill owns
`Demo logic`, `Legal pages`, `README`, and `Template showcase` directly — the rest,
delegate to their skill.

## Phase 2 — Rename the domain (Demo logic)

The shipped Untangle workspace is a **keepable base, not a demo to delete**. It splits
into two halves along a directory boundary drawn on purpose:

- **Keep, verbatim.** `packages/jobs/src/runs/` (the domain-agnostic run engine: steps,
  drivers, `runs`/`run_steps` persistence), `packages/db/src/schema/run.ts`, the SSE
  route (`apps/web/app/api/runs/route.ts`), and the run-history page
  (`apps/web/app/runs/page.tsx`, `apps/web/lib/sse.ts`). Anything AI-shaped you build
  next rides on this unchanged — you only ever swap the step list it runs.
- **Rename to your own noun.** `packages/jobs/src/tasks/` (the pipeline, heuristics,
  prompts, queries, constants — everything riding on the engine), and
  `packages/db/src/schema/task.ts` (the `captures`/`tasks` tables), and
  `apps/web/components/workspace/**` (the dump box, the list, the run strip — all of it
  is domain UI, including `run-reducer.ts`, which only ever handles the domain's own
  opaque `data` events).

Do the rename as a rename, not a rewrite — `git mv packages/jobs/src/tasks
packages/jobs/src/<your-noun>` and `git mv packages/db/src/schema/task.ts
packages/db/src/schema/<your-noun>.ts`, then let your editor's rename-symbol tool (or a
careful find-and-replace) carry `captures`/`tasks`/`Task`/`Capture` through the file
contents to your product's vocabulary. Ten touchpoints outside the renamed
directories/files, easy to miss because nothing above names them:

- `packages/db/src/schema/index.ts` — the `export * from "./task";` barrel line follows
  the file rename.
- `packages/jobs/src/index.ts` — the re-exported symbol groups sourced from
  `./tasks/*` follow the directory rename; keep the export list, just repoint the paths.
- `packages/jobs/src/events.ts` — `DAILY_PLAN_EVENT`'s value
  (`"untangle/daily-plan.requested"`) carries the placeholder namespace; rename the
  `untangle/` segment to your product's own (see `add-a-job`'s Phase 3 on event naming).
- `packages/jobs/src/cron/daily-plan-cron.ts` and `daily-plan-worker.ts` — the Inngest
  function `id`s and the `"daily-plan"` run `kind` string are cosmetic but worth renaming
  to match; nothing structural changes.
- `apps/web/app/dashboard/actions.ts` — `toggleTaskAction`, `createManualTaskAction`,
  `deleteTaskAction` follow your renamed nouns.
- `packages/email/src/templates/daily-plan.tsx` and its `SUBJECTS` entry in
  `packages/email/src/send.ts` — copy referencing "tasks" follows the rename; the
  template *file*name can stay `daily-plan` (that's the cron's name, not the domain's).
- `apps/web/components/marketing/hero.tsx` — **the non-obvious one.** The landing page's
  replayed run imports `DumpPanel`, `PriorityChip`, `RunStrip` and `runReducer` from
  `apps/web/components/workspace/`, deliberately: the replay runs through the real state
  machine instead of a mock, so it can never drift from the product. That means a
  marketing file sits downstream of your domain rename. Either carry the imports across
  with everything else, or strip the replay out of the hero now (Phase 3 removes it
  anyway) and skip the coupling entirely. `apps/web/components/marketing/three-passes.tsx`
  has the same coupling — it imports `PriorityChip` from
  `@/components/workspace/priority-chip` too, so it's a second marketing file downstream
  of this rename; carry it across (or delete it) the same way.
- `apps/web/components/marketing/nothing-disappears.tsx` — a third marketing file
  downstream of the rename, and the least obvious of the three: it renders the real
  `DumpPanel` (imported from `@/components/workspace/dump-panel`) in read-only mode over
  a fixed note, so it needs the same treatment as `hero.tsx` and `three-passes.tsx`.
- `apps/web/app/layout.tsx` — the root `metadata.title` is an object, not a string
  (`{ default: "Untangle — …", template: "%s · Untangle" }`); rename both halves. Two
  more pages lean on that template rather than setting their own full title:
  `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx` set only bare
  `title: "Terms of Service"` / `"Privacy Policy"` and rely on the `%s · Untangle` suffix,
  and `apps/web/app/(auth)/login/page.tsx` and `.../signup/page.tsx` carry their own
  `metadata` with product-flavoured descriptions. All four follow the rename.
- `apps/web/components/marketing/site-header.tsx` — brands the site by name (plus an
  emoji); update it alongside the rename.

Generate the rename migration:

```bash
pnpm db:generate
```

Review it before it runs — a table/column _rename_ migration should contain `ALTER
TABLE ... RENAME`, not a drop-and-recreate; if Drizzle proposes the latter, it read the
rename as a delete-then-add and you should rename the columns first, one at a time, to
give it the right diff. `pnpm check` after, to catch anything still importing the old
names.

**If you want no run engine at all** (rare — most products in this shape want to keep
it): the deletion recipe is `rm -rf packages/jobs/src/runs/ packages/jobs/src/tasks/
apps/web/components/workspace/`, plus deleting `packages/db/src/schema/{run,task}.ts`,
`apps/web/app/api/runs/route.ts`, and `apps/web/app/runs/page.tsx`, and the same barrel
cleanup as above except removing the touchpoints instead of renaming them. Generate and
review a drop migration the same way.

## Phase 3 — Template showcase (Template showcase)

`apps/web/app/page.tsx` runs in two acts, on purpose: act one is your product's own
landing page (`SiteHeader`, `Hero`, `ThreePasses`, `NothingDisappears`, an inline "what
it won't do" section, `DemoTeaser`, `SiteFooter` — keep this shape, it's yours) and act
two is the factory's own reveal (`BuiltOnFactory`, `FeaturesLink` — delete this with
the showcase). The two directories below make up the rest of that showcase — real for
the factory repo, convincing a developer evaluating it, not relevant once you have a
real product:

- **The component-docs pages** under `apps/web/app/features/` — one page per factory
  primitive (auth, billing, llm, jobs, email, observability, security, config, kernel),
  plus the directory's own index. Delete the whole directory:

  ```bash
  rm -rf apps/web/app/features/
  ```

  Then delete the marketing components that exist solely to power those pages — the
  shared page shell and the live env-var table:

  ```bash
  rm apps/web/components/marketing/feature-page-shell.tsx
  rm apps/web/components/marketing/env-table.tsx
  ```

  Any public API route those pages wired up for a live example (under
  `apps/web/app/api/demo/`, if present) goes with them.

  (`apps/web/app/features/page.tsx` sets `title: { absolute: … }` on purpose, to opt out
  of the product's `%s · Untangle` title template — that's deliberate, not a bug to fix,
  and it goes away with the rest of the directory.)

- **The `/features` docs pages' own demo components** — the "degradation, side by side"
  section showing the same run with and without an LLM key, and the `defineHandler` code
  comparison. As shipped, that's three files in `apps/web/components/marketing/`:

  ```bash
  rm apps/web/components/marketing/degradation-strip.tsx
  rm apps/web/components/marketing/kernel-code.tsx
  rm apps/web/components/marketing/live-example.tsx
  ```

  (`kernel-code.tsx` is the `defineHandler` code comparison; `live-example.tsx` backs the
  docs pages' live examples.)

  **`recorded-run.ts` is not an unconditional delete.** It's the fixture both those
  `/features` pages (`llm`, `jobs`) _and_ `hero.tsx` use — the landing page's hero
  replays it (imported relatively, as `./recorded-run`) so its demo runs through real
  fixture data instead of a mock. Deleting `app/features/` removes two of its three
  consumers; `hero.tsx` still imports it. Only delete `recorded-run.ts` once you've also
  stripped the replay out of `hero.tsx` — otherwise leave it in place, since act one of
  the landing page (Phase 3's intro above) is yours to keep.

  **`hero.tsx` is the one that will bite you.** It is NOT purely marketing: it imports
  `DumpPanel`, `PriorityChip`, `RunStrip` and `runReducer` from
  `apps/web/components/workspace/` so that the replay runs through the _real_ state
  machine rather than a mock. Two consequences, and both are easy to hit:

  - Deleting the fixture without also stripping the replay out of `hero.tsx` leaves it
    importing a module that no longer exists.
  - **If you did Phase 2's rename, you already had to touch `hero.tsx`** — those
    `@/components/workspace/*` imports follow the rename like any other. If Phase 2's
    `pnpm check` came back red pointing at the hero, this is why; it is not a mistake.

  Strip the replay from `hero.tsx` (keep the copy, the CTAs, and the eyebrow) and the
  coupling goes away entirely, and `recorded-run.ts` becomes a clean delete.

`/features` is a **whole page**, not a section of the home page. Since the M11 split moved
every technical block off the landing page and onto it, deleting `/features/` orphans a
lot more than the two components above — verify with a grep, then remove them:

```bash
rm apps/web/components/marketing/quickstart-strip.tsx   # only /features used it
rm apps/web/components/marketing/feature-card.tsx       # only /features used it
rm apps/web/components/marketing/features-meta.ts       # only /features/* used it
rm apps/web/components/marketing/control-panel.tsx      # only /features used it
rm apps/web/components/marketing/status-light.tsx       # only /features/* used it
rm apps/web/components/marketing/code-block.tsx         # only /features/* used it
rm apps/web/components/marketing/copy-button.tsx        # only code-block used it
rm apps/web/components/marketing/already-works.tsx      # moved to /features, only it used it
rm apps/web/components/marketing/why-it-holds.tsx       # moved to /features, only it used it
```

That is the whole technical component set: it exists to explain the factory, and once
the pages explaining the factory are gone, nothing imports it. Confirm before deleting —
if you have since used any of them on your own pages, keep those:

```bash
grep -rl "marketing/control-panel\|marketing/status-light\|marketing/code-block" apps/web
```

**What stays** is your landing page's own composition — act one of `page.tsx`, owned by
`brand-it`'s app-identity work rather than by this item: `hero`, `three-passes`,
`nothing-disappears`, `demo-teaser`, `site-header`, `site-footer`. These are copy about
YOUR product; rewrite them, don't delete them. `built-on-factory` and `features-link` are
act two — the factory reveal — and go with the rest of this item.

**Dead link**: `features-link.tsx` is a full-width card on the home page pointing at
`/features`, and `built-on-factory.tsx` is the section above it (act two of `page.tsx`)
that leads into it. Once `/features` is gone both are dead ends — remove them from
`apps/web/app/page.tsx` and delete the components, or repoint `features-link` at your own
docs.

**Middleware** (`apps/web/middleware.ts`) allowlists the deleted routes — remove the
`/features` entries (and any `/api/demo/` entry you added), and nothing else:

```diff
-  // Public template feature-explainer pages index.
-  "/features",
   ...
-const PREFIX_ALLOWLIST = ["/api/auth/", "/features/"];
+const PREFIX_ALLOWLIST = ["/api/auth/"];
```

Middleware is a **guarded zone** (`docs/agents/conventions.md`) — a PR touching it needs
a security checklist and an independent review, no exceptions for "just deleting two
lines." Make exactly this diff and nothing more; don't refactor the allowlist while
you're in there.

**`site-footer.tsx` is not part of this item** — it's the one marketing component
deliberately excluded from `Template showcase`'s scope, specifically so keeping its
"Built with Fabulous Factory" credit link never blocks launch. Keep it as-is if you're
willing; it costs nothing and the project could use the mention. If you'd rather remove
it, `apps/web/components/marketing/site-footer.tsx` is yours to edit like anything else —
just make sure whatever replaces it still links `/terms` and `/privacy` (see Phase 4).

## Phase 4 — Legal pages (Legal pages)

**Replace, don't delete.** `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx`
are placeholder copy, not placeholder routes — the site footer (`site-footer.tsx`, shared
across the public pages and the dashboard) links them, and deleting the pages without also
removing those footer links leaves dead links. Write real terms and a real privacy policy
(or keep them intentionally minimal for a prototype, but remove the "placeholder, shipped
by the template" notice once you have).

## Phase 5 — README (README)

Rewrite `README.md` for your product: replace the factory's own pitch with yours, drop
sections that describe the factory mechanics your users don't need to see (they're
already living in `docs/` and `.claude/skills/` for your agents), keep whatever quickstart
still applies.

## Phase 6 — Re-check

For each item you touched, verify its `LAUNCH.md` "Done means" criteria against actual
repo state, then tick it in `LAUNCH.md`. `Legal pages` is 🔒 — request explicit human
sign-off and fill the Signed off line instead of ticking it yourself. `pnpm
factory:status` afterward to confirm the render agrees.
