# PRODUCT.md

**Replace this — run the `define-product` skill.** Everything below is placeholder prose
shipped by the template, describing the golden-path demo (a page monitor) so the sections
aren't empty. It is not a product decision anyone made for you.

## One-liner

_Placeholder, shipped by the template:_ "A page monitor that watches URLs and tells you
when they change."

## Persona

_Placeholder:_ nobody yet — the template ships one page-monitor demo to exercise every
package, not a validated persona. `define-product` starts by asking who this is actually
for.

## Pricing

_Placeholder:_ the sentence is unwritten. Fill in the form: "People pay **$N/month** for
**X**." The table below mirrors the demo's shipped catalog in
`packages/config/src/plans.ts` as of right now — it will change the moment you run
`define-product` or `enable-billing`.

| Plan | Price/month | Limits      | Notes                                  |
| ---- | ----------- | ----------- | -------------------------------------- |
| Free | —           | 3 monitors  | never checked out through a provider   |
| Pro  | $9          | 25 monitors | `providerRefs.stripe` is a placeholder |

## Distribution

_Placeholder:_ none chosen. `define-product` asks where your first users actually come
from and records the real answer here.
