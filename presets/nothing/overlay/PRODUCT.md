# PRODUCT.md

**Replace this — run the `define-product` skill.** Everything below is placeholder prose
shipped by the template, describing the blank-slate scaffold (Nothing — a homepage,
capability pages, auth, and an empty dashboard, with no example domain built on top) so
the sections aren't empty. It is not a product decision anyone made for you.

## One-liner

_Placeholder, shipped by the template:_ "Nothing — sign up, log in, land on an empty
dashboard. Everything past that is what you build next."

## Persona

_Placeholder:_ nobody yet — the template ships the bare infrastructure (auth, billing
seam, LLM gateway, jobs, email) with no example domain riding on top of it, not a
validated persona. `define-product` starts by asking who this is actually for.

## Pricing

_Placeholder:_ the sentence is unwritten. Fill in the form: "People pay **$N/month** for
**X**." The table below mirrors the template's shipped catalog in
`packages/config/src/plans.ts` as of right now — it will change the moment you run
`define-product` or `enable-billing`.

| Plan | Price/month | Limits       | Notes                                  |
| ---- | ----------- | ------------ | -------------------------------------- |
| Free | —           | 5 runs/day   | never checked out through a provider   |
| Pro  | $9          | 200 runs/day | `providerRefs.stripe` is a placeholder |

## Distribution

_Placeholder:_ none chosen. `define-product` asks where your first users actually come
from and records the real answer here.
