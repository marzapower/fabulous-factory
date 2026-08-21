---
name: define-product
description: Interview the human about what this product actually is, fill in PRODUCT.md, and derive the first SPEC from it. Use when PRODUCT.md is still the template's shipped placeholder, or when the product direction has genuinely changed.
---

# Define product

`PRODUCT.md` is the human's document, not yours to invent. This skill is an interview,
not a fill-in-the-blanks exercise you run solo.

## Phase 1 — Interview

Ask, in your own words, not as a form:

- **One-liner**: what does this do, for whom, in one sentence?
- **Persona**: who specifically pays for this? Push past "developers" — what's their
  job, what are they doing right before they'd reach for this?
- **Pricing**: the sentence "people pay **$N/month** for **X**" — get a real number and a
  real limit, not a placeholder (`plans.ts`'s `priceUsdMonthly` field is USD; use
  whatever currency you actually charge in and note the mismatch if it isn't USD).
- **Distribution**: where do the first users actually come from — a community, a launch,
  a referral loop? Name the real place.

If the human is unsure on any of these, that's fine — record the uncertainty honestly
rather than inventing confidence.

## Phase 2 — Fill PRODUCT.md

Write the answers into the root `PRODUCT.md`, following the structure already there
(mirrors `docs/templates/PRODUCT.md`). Replace every "Replace this" / "Placeholder"
marker — don't leave any behind. Update the pricing table to match reality, then make
`packages/config/src/plans.ts` match the table (id, name, `monitorLimit`,
`priceUsdMonthly`, `providerRefs`) — `plans.ts` is what the app actually reads;
`PRODUCT.md` is its human-readable mirror. Real Stripe price IDs come later, in
`enable-billing`.

## Phase 3 — First SPEC

From the filled `PRODUCT.md`, derive the first feature SPEC using
`docs/templates/SPEC.md`: pick the smallest slice of the one-liner that's actually
buildable first, and write it as `docs/specs/<slug>.md` (create the directory if it
doesn't exist). This SPEC is what `add-a-feature` starts from next.

## Phase 4 — Re-check the ledger

Run `pnpm factory:status`. The `product-def` item should now report `touched` — if it
still reports `factory-default`, `PRODUCT.md` wasn't actually edited (a formatter pass
alone won't flip it either way that matters — the content has to change).
