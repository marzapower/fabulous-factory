# Launch Checklist — replacing the hash-based Adoption Ledger

**Date:** 2026-08-21
**Status:** Approved design (rev 2, post-adversarial-review), pending implementation

## 1. Problem

The Adoption Ledger infers adoption progress from SHA-256 hashes of shipped files
(`.factory/manifest.json` + `factory-ledger.ts`). The hash check answers _"was this file
edited?"_ but the launch question is _"was this item completed?"_. A one-character edit to
`terms/page.tsx` greens `legal-pages` while the Terms remain legally empty. The manifest's
own comment admits the recipes, not the hashes, are the real gate — but nothing records
completion as a first-class fact. Field experience (adopted repo, 2026-08-21): ledger
reported 7/8 customized while the product remained launch-incomplete on several
semantically-unfinished items.

## 2. Decision

Replace the hash mechanism **entirely** with a declarative launch checklist, `LAUNCH.md`,
enforced by **agent/skill discipline only** (no CLI gate). Items carry explicit acceptance
criteria ("Done means"); judgment items additionally require **human sign-off** before
being ticked. `pnpm factory:status` survives as a **dumb read-only renderer** of the
checklist (plus its existing staged-agents roster). `pnpm preflight` survives as the
_mechanical_ env gate (Stripe key, pointer files, handoff presence, email capability) and
loses its ledger loop — `LAUNCH.md` is the _semantic_ gate; different jobs, no overlap.

**Accepted loss (explicit):** nothing mechanical detects "a shipped factory default was
edited" or "a newly shipped default lacks a checklist item" anymore. The drift test in §8
guards only the seeded item list. This is the price of dropping hashes, accepted by
design.

## 3. LAUNCH.md — format specification

Staged at `.factory/handoff/LAUNCH.md`; `pnpm factory:init` promotes it to the **repo
root** (peer of `PRODUCT.md`). The template repo never has one at root.

### 3.1 Grammar (parser contract)

- An **item** is a line matching `^## \[( |x|X)\] (.+)$`. Anything else is ignored —
  adopters may restructure prose freely.
- An item's **section** runs until the next line matching `^## ` (level-2 exactly; `###`
  sub-headings belong to the item) or EOF.
- The heading may carry two optional markers after the title, written as trailing
  `·`-separated segments: `🔒 human sign-off` and `blocks launch`. **Detection** is by
  substring on the heading text (`🔒` anywhere → humanSignoff; `blocks launch` anywhere →
  blocksLaunch). **Title stripping algorithm** (deterministic): split the heading text on
  `·`, drop every segment containing `🔒` or `blocks launch`, rejoin the rest with
  `·`, trim. (If an adopter writes markers without the separator, detection still works
  but the title keeps the marker text — accepted, documented in the parser's doc comment.)
- Within an item's section the parser recognizes `**Skill:** <name>` → `skill` (optional;
  null if absent). The `**Signed off:**` line is informational only, never parsed.
- Parsed item shape: `{ title: string; done: boolean; blocksLaunch: boolean;
humanSignoff: boolean; skill: string | null }`.

### 3.2 Item template

```markdown
## [ ] Legal pages 🔒 human sign-off · blocks launch

**Why:** Terms and Privacy still carry the template's placeholder copy.
**Skill:** make-it-yours

**Done means:**

- Terms name the real legal entity, jurisdiction, and contact address
- Privacy lists the actual data processors and retention policy
- No REPLACE_ME / placeholder markers remain in either page

**Signed off:** _(date + who confirmed — filled only when ticked)_
```

### 3.3 Preamble contract

The file opens with one paragraph stating: _no agent may declare this product
production-ready, flip the stage to production, or proceed past pre-ship-check's first
phase while an unchecked `blocks launch` item exists; 🔒 items are ticked only after
explicit human confirmation, recorded on the Signed off line. Non-🔒 items are ticked by
the agent only after verifying every "Done means" criterion against actual repo state.
Adopters may add product-specific items — this file is theirs._

**Gate scope (pins finding 16):** the hard gate is `blocks launch` items only. Open 🔒
items that do NOT block launch (e.g. Plans catalog) must be _surfaced_ to the human during
pre-ship-check with a recommendation, but do not gate.

### 3.4 Seeded items (from today's manifest)

| Item               | 🔒  | blocks launch | Skill          | Done-means gist                                                                                                                                |
| ------------------ | --- | ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Product definition | yes | yes           | define-product | PRODUCT.md describes the real product: audience, problem, core loop, pricing intent; no template placeholder text                              |
| App identity       | no  | yes           | brand-it       | Landing page, layout metadata, hero, header, features copy, demo teaser all speak the product's name and value prop                            |
| Design system      | no  | no            | brand-it       | globals.css tokens express a deliberate product brand (colors, fonts), not the shipped defaults                                                |
| Demo logic         | no  | yes           | make-it-yours  | Page-monitor demo (jobs, dashboard, schema, components) replaced by or rebuilt into the product's real feature; no orphaned demo tables/routes |
| Legal pages        | yes | yes           | make-it-yours  | Real legal entity, jurisdiction, contact; privacy lists actual processors and retention; no placeholders                                       |
| Email templates    | no  | no            | brand-it       | Verify-email, magic-link, change-digest carry product branding and correct sender identity                                                     |
| Plans catalog      | yes | no            | enable-billing | plans.ts encodes the product's real tiers, limits, and prices; no REPLACE_ME; Stripe price IDs real if billing enabled                         |
| Template showcase  | no  | yes           | make-it-yours  | /features/* explainer pages and their marketing components removed or replaced with product content                                            |
| README             | no  | no            | make-it-yours  | README describes the product, its setup, and its deploy story — not the template                                                               |

(Agent writing the seeded file expands each gist into concrete bullet criteria.)

## 4. Retired

- `.factory/manifest.json`
- In `factory-ledger.ts`: `hashFile`, `itemStatus`, `staleEntries`, `loadManifest`,
  `ManifestItem`, `ItemStatus`, `LedgerReport`, `ledgerReport`, `ledgerReportSafe`,
  `renderStatusLines`, `LEDGER_UNAVAILABLE`
- `packages/config/scripts/factory-manifest.ts` and the `factory:manifest` script
- The manifest-freshness gate inside `pnpm check` (package.json:18) **and** the standalone
  CI step `.github/workflows/ci.yml` "Adoption manifest freshness" (`pnpm factory:manifest
--check`, lines ~75-76) — two independent wirings, both go
- The "manifest freshness" clause in every Definition-of-done: root `CLAUDE.md`,
  `.factory/handoff/CLAUDE.md`, **`docs/agents/conventions.md:89` (the canonical DoD)**,
  `.claude/agents/fab-forge.md:39`, `.factory/handoff/agents/fab-smith.md:68`,
  `.factory/handoff/skills/add-a-feature/SKILL.md:42`, `CONTRIBUTING.md:41`
- `.claude/skills/update-ledger-hashes/` (whole skill) **and its entry in
  `FACTORY_DEV_ONLY_SKILLS` (`factory-init.ts:31-36`)**
- `packages/config/test/factory-ledger.test.ts` (hash/status tests; replaced per §8)

## 5. Survives, slimmed

- `factory-ledger.ts` → renamed `factory-stage.ts`: keeps `loadFactoryConfig`,
  `loadStage`, `Stage`, `HANDOFF_NAG`, handoff-presence helper. New sibling module
  `launch-checklist.ts` holds the pure parser (§3.1) and renderer helpers; both take
  `rootDir`/content explicitly, never `process.cwd()`/`process.env`, `rootDir` threaded
  verbatim (no realpath — opt-23 still applies).
- `pnpm preflight`: keeps handoff-present, `sk_test_` Stripe key, pointer-file staleness,
  email-disabled warning, stage awareness (`evaluatePreflight` lines ~55, 61-70 come out;
  ~71-104 stay). Drops the per-item ledger loop and ledger rendering. Header output:
  stage line + handoff nag (unchanged semantics), then warnings/failures.
- `doctor.ts` factory section (~341-356): drops ledger lines; keeps stage display and
  handoff nag.
- `.gitattributes`: the `eol=lf` rule **stays**; its comment block (lines 1-3) is
  rewritten — the hash-stability rationale is dead, the surviving rationale is ordinary
  cross-platform diff hygiene.
- `.factory/config.json` and the prototype/production stage flag: unchanged.

## 6. factory:status — dumb renderer

Rewritten to render `LAUNCH.md` from the repo root:

- First line **always** `stage: <stage>` (stage comes from `.factory/config.json`,
  independent of LAUNCH.md presence).
- The existing staged-agents roster announcement (current `factory-status.ts:35-40`,
  asserted by `factory-agents.test.ts:150-158`) **is kept** — printed when
  `.factory/handoff/agents/` exists. In template/fresh-clone mode this plus the nag is the
  whole useful output.
- One line per item: `✓ <title>` when done; `○ <title>` when open, appending
  ` — blocks launch` and ` → skill: <skill>` when applicable; `🔒` shown on sign-off items.
- Last line: `<done>/<total> done · <open blockers> launch blocker(s) open`.
- No `LAUNCH.md` at root → after the stage line (and roster, if any): print `HANDOFF_NAG`
  if `.factory/handoff/` exists (respecting `FACTORY_DEV=1` silencing), else
  `no LAUNCH.md found — nothing to report`.
- Always exit 0. It renders; it never gates.

## 7. Rewritten for the new contract

- **`pre-ship-check` skill** (full rewrite of Phases 1-3, not an append): Phase 0 — open
  `LAUNCH.md`; every `blocks launch` item must be ticked (verify criteria for non-🔒,
  request sign-off for 🔒); surface open non-blocking 🔒 items with a recommendation; may
  not proceed otherwise. Phase 1's "preflight becomes blocking on ledger items" claim
  (SKILL.md:16-17) is now false and must be rewritten: in production stage preflight
  blocks only on env/pointer/handoff checks. The blocker walkthrough (:26-33) and the
  "manifest freshness" mention (:45) are rewritten accordingly.
- **Adopter skills — rewrites, not appends:**
  - `make-it-yours/SKILL.md`: frontmatter `description` (:3, "Walks the Adoption Ledger
    item by item" — drives skill discovery), :11-14, :128 → checklist-driven flow;
    closing step: verify Done-means, tick or request sign-off.
  - `define-product/SKILL.md`: "Phase 4 — Re-check the ledger" (:44) → verify + tick (🔒:
    request sign-off).
  - `brand-it/SKILL.md`: :57 (asserts ledger ids flip to `touched`) → verify + tick.
  - `enable-billing/SKILL.md`: closing step added (Plans catalog is 🔒: request sign-off).
- **`.factory/handoff/CLAUDE.md`**: Adoption Ledger paragraph → LAUNCH.md contract
  paragraph (≤4 lines — the file sits at 49 lines against the <60 cap enforced by
  `factory-docs.test.ts:67-70`; trim as needed); DoD drops manifest freshness; skills text
  repointed at `LAUNCH.md` + the `factory:status` renderer.
- **`fab-preflight` handoff agent**: reports on LAUNCH.md state + preflight + gates.
- **`fab-muse` handoff agent** (:59): ledger-id checking via factory:status → LAUNCH.md
  items.
- **`fab-steward`** (factory-dev agent): drops ledger-hash duties; keeps handoff mirrors,
  tiering, ADRs. Trigger description no longer mentions manifest-tracked files.
- **`factory-init.ts`**: adds `LAUNCH.md` to the promotion loop (:54, currently
  `["CLAUDE.md","AGENTS.md"]`) — but **copy-if-absent** for `LAUNCH.md` specifically (an
  interrupted-run re-run must never overwrite a ticked checklist with the pristine seed;
  CLAUDE.md/AGENTS.md keep force-overwrite). Removes the `update-ledger-hashes` entry from
  `FACTORY_DEV_ONLY_SKILLS`.
- **`docs/guides/launch-checklist.md` (name collision)**: the existing maintainer
  release guide is renamed to `docs/guides/release-checklist.md`; its three referrers
  updated (README.md:234, `release-template/SKILL.md:56`,
  `docs/superpowers/plans/milestones/m10-polish-distribution.md:16`).
- **`release-template` skill**: Phase 2 (the manifest phase, :21-27) deleted, later
  phases renumbered; the clean-clone `factory:init` verification (:33-38) gains an
  assertion that `LAUNCH.md` landed at root.
- **Root `CLAUDE.md`**, **README** (incl. the :262 "run pnpm factory:status and get to
  work" closer — repoint at the handoff/init flow), **CONTRIBUTING** (:41, :68-71, :77):
  purge ledger/manifest references; describe the checklist where relevant.
- **ADR 0003** in `docs/adr/` recording this decision (hash ledger → declarative
  checklist; enforcement by agent discipline; rationale and rejected alternatives).

## 8. Testing

- `launch-checklist` parser tests (temp-dir/content fixtures): tick states (` `/`x`/`X`),
  marker detection and title-stripping algorithm (both orders, missing separator,
  single marker), skill extraction, `###` sub-headings not terminating a section, missing
  file, malformed/non-item headings ignored, adopter-added custom items counted.
- `factory:status` renderer tests: output lines, summary math, missing-file paths (stage
  line always present), exit code 0.
- `factory-agents.test.ts`: roster assertion (:150-158) survives — renderer keeps the
  roster; update only if output wording shifts.
- `factory-init` test: `LAUNCH.md` promoted to root; re-run does NOT overwrite an edited
  root `LAUNCH.md` (copy-if-absent); no manifest references remain.
- Template-repo drift test: the staged `.factory/handoff/LAUNCH.md` parses and contains
  exactly the 9 seeded items with correct markers (🔒 on Product definition, Legal pages,
  Plans catalog; `blocks launch` per §3.4). Guards the seeded list only — see §2's
  accepted loss.
- `preflight.test.ts` updated: `writeManifest` helper (:36-43), blocksProduction blocker
  assertions (:71, :108), and the missing-manifest describe block (:202-220) all go; env
  checks untouched. (There is no doctor test file — nothing to update there.)

## 9. Out of scope

- Any CLI enforcement of the checklist (explicitly rejected in design).
- Migration tooling for already-adopted repos (template-only change; adopters who cloned
  earlier keep their old mechanism).
- Changes to the stage model, preflight env checks, or `pnpm check` beyond removing the
  manifest-freshness gate.
- Historical documents (`docs/superpowers/plans/**`, the 2026-08-20 design spec, ADRs
  0001-0002) keep their ledger references — they are frozen records of past decisions,
  not live contract. This spec and the new ADR supersede them.
