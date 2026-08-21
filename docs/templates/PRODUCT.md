# PRODUCT.md

This is the human's document — plain language, no code. Agents read it to derive specs
(`docs/templates/SPEC.md`); they should never need to guess what the product is.

## One-liner

The product in one sentence. Someone who has never heard of it should know what it does
and who it's for.

> e.g. "A page monitor that tells you the moment a competitor changes their pricing."

## Persona

Who pays for this, specifically. Not "developers" — a real, narrow persona: their job,
what they're doing right before they'd reach for this, what they're doing right after.

## Pricing

The sentence: "People pay **$N/month** for **X**." Fill in the blank, then make the
pricing tiers table below match `packages/config/src/plans.ts` — that file is the single
source of truth the app actually reads (`priceUsdMonthly` is USD; this table is the
human-readable mirror of it).

| Plan | Price/month | Limits | Notes |
| ---- | ----------- | ------ | ----- |
| Free | —           |        |       |
| Pro  | $           |        |       |

## Distribution

Where the first users come from — concretely, not "marketing." A channel, a community, a
launch, a referral loop: name the actual place you'll post, ship, or pitch this.
