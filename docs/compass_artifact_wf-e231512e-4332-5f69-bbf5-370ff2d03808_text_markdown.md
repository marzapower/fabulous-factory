# The LLM-Powered Micro-SaaS Factory: A 2026 Playbook for a Solo CTO Building a Portfolio of Small, Stable MRR Products

## TL;DR
- **Yes, this is viable — but the constraint is distribution and taxes, not building.** With Claude Code (Opus 5 / Fable 5) plus a shared boilerplate you can ship a launchable micro-product in days; the hard part is that ~70% of micro-SaaS earn under $1,000 MRR, the median profitable one sits near $4,200 MRR, and most die within two months. Win by picking boring, painful B2B/prosumer niches with built-in marketplace distribution (Chrome/Slack/Notion/Shopify), charging from day one, and running a portfolio so a few winners carry the losers.
- **Divide the AI labor:** Claude Opus 5 / Fable 5 / Claude Code for architecture, scaffolding, refactoring, tests, deploy scripts and maintenance (spec-driven, with CLAUDE.md conventions and mandatory human security review); ChatGPT / GPT-5.x for marketing copy, SEO/programmatic content, image generation, and customer-support automation — the two things Claude cannot do (images, voice) and the one it is arguably weaker at (fast high-variety marketing variations).
- **For an Italian employed CTO specifically:** because your salary exceeds €35,000, the flat-tax *regime forfettario* is OFF the table — side SaaS income stacks on your salary at a 43% marginal IRPEF rate, and recurring subscriptions legally require a Partita IVA (they are not "occasional"). Use a **Merchant of Record (Paddle or Lemon Squeezy)** to erase all EU VAT/OSS headaches, and talk to a *commercialista* before you scale.

## Key Findings

**1. The market is real but brutally power-lawed.** A 2025 analysis of 1,000 micro-SaaS products found roughly 70% earn under $1,000 MRR and only ~5% exceed $100K MRR, with the median profitable product around $4,200 MRR. One documented Indie Hackers builder logged 4 years, 26 projects, and $115K total — averaging ~$4,400/year, with most products abandoned within two months. Implication: for your €100–1,000/month-each goal, you need a *portfolio* and ruthless kill discipline, not a single bet.

**2. The proven playbook is levelsio/Marc Lou style: ship fast, charge from day one, build in public, run a portfolio.** Pieter Levels runs Photo AI at ~$132–138K MRR by November 2025 (launched February 2023), solo; in his own levels.io post he describes photoai.com as "a 40,870 line index.php making $105,000/mo revenue and $80,000/mo profit" — one of 40+ products he has launched on vanilla PHP/jQuery/SQLite with ~87% margins on a single ~$40/mo VPS. His "12 startups in 12 months" and "leave failed-but-cheap projects running" rules are the template. Marc Lou hit ~$65K/month across ~20 products; his ShipFast boilerplate (launched September 1, 2023) generated $40,000 by the end of its first month and peaked around $141K MRR in April 2024 before declining as the Next.js boilerplate market saturated — ShipFast and his CodeFast course now each make roughly $20K/month. The transferable lessons: a reusable boilerplate, distribution via a personal brand, subscriptions where they fit and one-time pricing where they don't.

**3. Fastest-to-stable-MRR product types in 2025–2026** are narrow, "boring," and plugged into an existing platform's distribution: developer/uptime tools, AI PR reviewers, creator scheduling/repurposing, standup/status bots, payment-recovery and compliance glue, and especially **marketplace extensions**. Chrome extensions are a standout for solo builders because the Web Store *is* the distribution: Saeed Ezzati's Superpower ChatGPT reached ~$20–30K MRR (built in 2–3 days initially); "Easy Folders" hit $3,700+ MRR / $42K total in six months; individual devs report $500–$1,500/mo from tiny single-purpose extensions. But numbers are bimodal — many portfolios of extensions make almost nothing (one dev's 38-extension portfolio: ~$31/mo).

**4. AI "wrappers" are the highest-risk category.** Reported category averages: ~65% of AI-wrapper customers churn within 90 days (vs ~35% SaaS norm), 80–95% fail, and only 2–5% ever break $10K/mo. Per Stanford HAI's 2025 AI Index, inference cost for GPT-3.5-level performance dropped over 280-fold between November 2022 and October 2024 (from $20.00 to $0.07 per million tokens), and OpenAI's roadmap alone cannibalized 200+ funded wrapper startups in 2024. The moat is never the model (everyone has the same API) — it's proprietary data, deep workflow integration, distribution, and a specific niche UX. Levels' own defense of Photo AI: competitiveness comes from UX and marketing dialed in for one use case ("LinkedIn profile photos"), not the tech.

**5. Claude is the build engine; ChatGPT is the go-to-market engine.** As of August 2026 Anthropic's lineup is Claude Haiku 4.5 ($1/$5 per MTok), Sonnet 5 ($2/$10), Opus 5 ($5/$25, the recommended default for complex agentic coding, released July 24, 2026), and Fable 5 ($10/$50, the top tier above Opus). Claude Code (GA since May 2025) is the reference agentic coding tool. Consensus across 2026 comparisons: Claude leads on coding, refactoring, long-context reasoning and writing that needs less editing; ChatGPT/GPT-5.x leads on image generation, voice, browsing, the GPTs ecosystem, and fast high-variety marketing ideation. Claude has no image generation — so image/marketing assets are a natural ChatGPT job.

**6. AI-generated code is a genuine security/tech-debt liability you must gate.** Veracode's 2025 GenAI Code Security Report (100+ LLMs across 80 tasks) found that "in 45% of the cases these models introduce a detectable OWASP Top 10 security vulnerability" — XSS failed 86% of the time and Java 72%; Veracode CTO Jens Wessling summarized it as "GenAI models make the wrong choices nearly half the time, and it's not improving." Escape.tech's October 2025 scan of 5,600 vibe-coded production apps found 2,038 highly critical vulnerabilities, 400+ leaked secrets, and 175 PII exposures; a separate DEV Community scan of 100 Lovable/Bolt/Cursor/v0 apps found 65% had security issues and 58% at least one critical. GitClear found refactoring dropped and code duplication jumped ~8x in 2024. As a 15-year CTO this is your edge over vibe-coders: enforce spec-driven development, CI security gates, secret scanning, and human review of every auth/payment path.

**7. Distribution — not Product Hunt alone — is the wall.** Product Hunt in 2026 is a one-day visibility spike and a dofollow backlink/badge, not a user-acquisition engine; winners stack channels (Reddit for first traction, SEO for compounding, Indie Hackers for founder-credibility, LinkedIn DMs for B2B, marketplaces for built-in demand). One data set found Indie Hackers converting far better than Product Hunt for founder-focused products. Programmatic SEO still works but only with a real per-page data source and genuine value — Google penalizes scaled thin/AI "slop," and mass-AI pages were demoted heavily in 2024–2026 core updates.

**8. Monetization: subscriptions for tools people "live in," one-time/LTD for utilities.** Freemium extension conversion is ~2–5% of active users. Lifetime deals give cash and users but AppSumo takes ~70% and carries ~16–17% refund rates; a direct LTD via an MoR keeps 95%+. Realistic timelines: a focused micro-SaaS ships in 2–6 weeks; first paying customer month 2–3; $1K MRR month 4–6 *if you already have an audience*, otherwise 9–18 months.

## Details

### A. What to build (and what to avoid)

**Best bets for a technical solo founder with limited time:**
- **Marketplace-native extensions/apps** (Chrome, VS Code, Slack, Notion, Shopify, WordPress). The marketplace supplies discovery; you build for a big host platform's existing users (Ezzati's rule: build for Gmail/LinkedIn/Salesforce-scale platforms, or for platforms with a marketplace but fewer competitors like Zoom/Salesforce). This is the single best distribution-for-free lever for someone who hates marketing.
- **"Boring" B2B glue and infra**: uptime/status pages, payment-recovery/dunning, backup tools for Supabase/Neon/PlanetScale, standup/status bots, compliance/reporting automation. These have real budgets, low support, and low churn.
- **Vertical micro-tools** for a specific profession (the "CRM for fitness coaches," not "CRM for everyone"). Narrow niche = fast traction, but a low ceiling — perfect for €100–1,000/mo units.
- **Info products / templates / boilerplates** as a top-of-funnel and cash engine (Marc Lou's ShipFast, CodeFast). Near-zero maintenance, one-time revenue.

**Avoid / handle with extreme care:**
- **Thin AI wrappers** with no data or workflow moat (commoditized in ~12–18 months, ~65% 90-day churn).
- **Generic horizontal chatbots** (most overcrowded category).
- Anything where **OpenAI/Anthropic shipping a native feature kills you overnight**.

### B. The AI division of labor (your actual daily workflow)

**Claude (build + operate):**
- **Model routing to control cost:** Sonnet 5 as the daily driver for most coding; Opus 5 for hard architecture, multi-file refactors, and long-horizon agentic tasks; Fable 5 reserved for the genuinely hardest problems (it's 5x Opus's output cost); Haiku 4.5 for cheap high-volume sub-steps (classification, code review, routing). Document this routing in CLAUDE.md.
- **Claude Code best practices (2026 consensus):** keep CLAUDE.md lean (~under 60 lines, stable conventions + "definition of done" + never-touch rules — it's advisory context, not a security boundary); use **plan mode** (explore → plan → code) before edits; use **subagents** for noisy research and independent verification (have a fresh agent try to refute the work); run **parallel agents in git worktrees** for your multiple repos; use **hooks** as deterministic guardrails (pre-commit formatters, linters, secret scanners, tests); `/clear` between tasks and `/compact` as context fills (quality degrades past ~40–70% context use).
- **Spec-driven development (SDD):** For anything non-trivial, use GitHub Spec Kit (open-sourced Sept 2025; works with Claude Code) — Constitution → Specify → Plan → Tasks → Implement. This is the fix for "vibe coding at scale" and directly addresses your maintainability concern across many parallel repos. Note the documented limit: CLAUDE.md instructions are probabilistically followed, so back conventions with deterministic hooks/CI, not just prose.
- **Operate/maintain:** Claude Code in headless/CI mode for dependency bumps, monitoring hooks, and routine fixes.

**ChatGPT / GPT-5.x (market + support):**
- Marketing copy, landing-page variations, cold-outreach and social hooks (faster high-variety ideation), **image generation** (Claude has none), programmatic-SEO content drafts, and customer-support automation. Use the GPTs ecosystem and browsing for competitive/keyword research.
- Cost-effective combo: Claude Pro/Max subscription for coding; ChatGPT Plus for marketing/images; use APIs (Haiku/GPT-mini tiers) for any in-product AI features to keep COGS low, and prompt-cache aggressively.

**Non-negotiable human gates (your CTO value-add):** manual review of all auth, payments, and data-access code; RLS/authorization checks (the Lovable CVE-2025-48757 class of bug — apps that failed to set Supabase Row-Level Security, exposing 170+ apps to unauthenticated DB access); CSRF/security-header/SSRF checks; secret scanning in CI. Treat AI code as untrusted third-party input.

### C. The "product factory" — shared infrastructure

Build once, reuse across every product (this is the ShipFast insight):
- **Monorepo or template repo** with auth, billing, emails, analytics, landing-page components, and a CLAUDE.md/Spec-Kit constitution baked in.
- **Standard stack** ("boring stack": Next.js + Tailwind + Postgres + Stripe/MoR + Resend is the common indie default; but as Levels proves, "use what you know" beats fashionable). As an experienced CTO, pick one stack and freeze it.
- **Shared services:** one auth pattern, one payment integration, one transactional-email provider, one analytics setup, one deploy pipeline.
- **Launch checklist** as a reusable template; **portfolio dashboard** (MRR, churn, support load per product).
- **Kill/keep rule** (levelsio): if a product gets no traction in weeks, kill or park it; if upkeep is near-zero, leave it running rather than shutting down (dead-cheap products occasionally revive). Concentrate time on the 1–2 that show a pulse.

### D. Distribution playbook for tiny products (low effort)

1. **Pick products with built-in distribution first** (marketplaces). This removes 80% of the marketing problem.
2. **Launch stack, not single launch:** Product Hunt (badge + backlink + spike) + Show HN (if technically interesting, honest framing) + relevant subreddits (genuine participation) + Indie Hackers (build-in-public) + niche directories same-day.
3. **Programmatic SEO done right:** one genuine data source per page, real value beyond variable substitution, 3+ sources per page; avoid mass AI "slop" (Google demotes it). Comparison, integration, and city/industry templates survive best.
4. **Build in public** on X/LinkedIn from day one (levelsio/Marc Lou's compounding free channel) — but this is a multi-year audience play; don't expect it to pay off on product #1.
5. **B2B:** targeted LinkedIn/cold DMs and getting listed in the host platform's app directory (e.g., Stripe Apps).

### E. Monetization models

- **Subscription** ($9–49/mo typical for micro-SaaS) for tools people use continuously — best LTV, but watch churn.
- **One-time / lifetime** for *utilities* people use to get a job done and leave (one dev killed a $12/mo sub with zero retention and switched to a lifetime deal because his tool was a utility, not a platform). LTDs give cash + users; run them **directly via an MoR** (keep 95%+) rather than AppSumo (~70% cut, ~16–17% refunds) unless you need AppSumo's audience.
- **Usage-based** for anything with real marginal (inference) cost — protects margins.
- **Freemium** for extensions (2–5% conversion): gate what power users need constantly, not core function.

### F. Payments & taxes for an Italian employed CTO (critical, specific)

- **Payment provider:** Use a **Merchant of Record** — **Paddle** (better for B2B invoicing/reverse-charge) or **Lemon Squeezy** (fastest setup for indie/digital, now Stripe-owned but still independent). Both charge ~5% + $0.50 and become the legal seller, so they collect and remit EU VAT/US sales tax for you. This removes the €10,000 EU OSS threshold tracking and all VAT registration burden. Stripe alone is a processor, not an MoR — with Stripe you own VAT/OSS compliance (Stripe Tax ~0.5% helps calculate but you still register/file).
- **Regime forfettario is NOT available to you:** the Legge di Bilancio 2025 (L. 207/2024, art. 1 c. 12) raised the art. 1 c. 57 lett. d-ter (L. 190/2014) exclusion threshold from €30,000 to €35,000 of prior-year employment income for 2025, and the Bilancio 2026 (art. 12) confirmed €35,000 for 2026 (reverting to €30,000 from 2027 absent new law). A CTO salary is well over this, so you are excluded.
- **Consequence:** A Partita IVA would fall under the **regime ordinario**, and SaaS profits **stack on top of your salary** at your top marginal IRPEF rate — for 2026 the brackets are 23% (to €28k), 33% (€28–50k), 43% (over €50k), plus regional/municipal surtaxes. For a CTO that means ~**43%** on the side income, plus 22% IVA obligations and full accounting.
- **Recurring SaaS is legally "abituale," not "occasionale":** the €5,000 figure is only an INPS franchigia for genuinely one-off work; ongoing subscriptions require a **Partita IVA regardless of amount**. Don't try to run a subscription business as prestazione occasionale.
- **INPS:** As an employee you're already covered by obligatory pension insurance, so a Partita IVA professional enrollment in **Gestione Separata is at the reduced 24% rate** (not 26.07%), calculated on actual net business income.
- **Net effect:** the Italian tax math (≈43% IRPEF + 24% INPS on net) materially changes what "€100–1,000/mo per product" is worth to you. **Consult a commercialista before opening a Partita IVA** — the convenience depends on expected revenue vs deductible costs.

## Recommendations

**Stage 0 — Foundation (weekend):** Build one reusable template repo (auth, MoR billing, email, analytics, landing components) with a frozen stack you know. Add a lean CLAUDE.md and a Spec-Kit constitution. Set up CI with linting, secret scanning, and security gates. Subscribe to Claude (Max) for coding and ChatGPT Plus for marketing/images.

**Stage 1 — First 2–3 products (weeks 1–8):** Pick marketplace-native, boring-B2B or vertical-utility ideas with existing paid demand. Spec each with Spec Kit, build with Sonnet 5 (Opus 5 for hard parts), charge from day one via Lemon Squeezy/Paddle. Ship in days-to-weeks, not months. Human-review all auth/payment code.

**Stage 2 — Distribute & measure (weeks 4–16):** Launch each on a stacked set of channels; lean on the host marketplace for discovery. Use GPT-5.x for SEO content and support automation. Track MRR/churn/support-load per product on one dashboard.

**Stage 3 — Prune & double down (ongoing):** Apply the kill/keep rule at ~4–8 weeks per product. Park zero-traction products (leave running if upkeep ≈ €0). Pour time into the 1–2 with signal; raise prices when conversion >4% or users say "it's cheap." Only then formalize the Partita IVA with a commercialista.

**Benchmarks that should change your strategy:**
- If a product isn't at first paying customer by ~week 8 with active promotion → park it.
- If AI COGS approaches 50% of a product's revenue → move to usage-based pricing or kill.
- If churn >10%/mo on a "subscription" product → it's probably a utility; switch to one-time/LTD.
- If total side income approaches a level where 43% IRPEF + 24% INPS makes it not worth your limited time → consider consolidating into fewer, higher-price B2B products, or a company structure (SRL) — a commercialista call.
- If build-in-public audience < a few thousand after a year → keep relying on marketplace/SEO distribution, not personal brand.

## Caveats
- **Revenue figures are self-reported/estimated.** Indie Hackers, Starter Story, and Medium numbers (Levels, Marc Lou, extension MRRs) come from founder tweets, landing pages, and third-party trackers (GetLatka etc.), not audited accounts; treat them as directional. ShipFast's decline from ~$141K to ~$20K MRR shows how fast these numbers move.
- **Model naming/pricing (Fable 5, Opus 5, Sonnet 5) reflects sources dated to August 2026** and Anthropic's fast release cadence; verify current model IDs and prices before committing API spend, as older models (Opus 4.x, Sonnet 4.x) were being retired through mid-2026.
- **The security/tech-debt statistics** (Veracode 45%, Escape.tech scans) are from vendors with an interest in the problem, but the direction is corroborated across academic (arXiv, Georgia Tech Vibe Security Radar) and independent sources.
- **Tax details are a framework, not personalized advice.** Thresholds and IRPEF brackets are 2025–2026-specific and change with each Legge di Bilancio; ViDA/OSS reforms are phasing in through 2027. Confirm everything with a qualified Italian commercialista before acting.
- **"AI content is fine if it's good" is Google's stated position, but enforcement is aggressive** — recovery from a scaled-content penalty is rare. Don't bet a product's distribution solely on AI-generated pages.