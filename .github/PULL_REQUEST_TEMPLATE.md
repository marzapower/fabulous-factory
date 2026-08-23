<!-- Fabulous Factory PR template (design spec §8.5, plan D.7/D.9.15). -->

## Summary

<!-- What does this PR do, and why? -->

## Test plan

<!-- pnpm check output, manual verification steps, screenshots, etc. -->

## Guarded-zone security checklist

Required **only** when this PR touches `packages/auth`, `packages/core`, `packages/billing`,
your app's `proxy.ts` (`apps/*/proxy.ts`), the shared `packages/ui/src/middleware.ts` it
calls into, or `packages/db/migrations` (design spec §8.5). CI's
`guarded-zones` job blocks merge on those paths until every item below is checked and the
final line reads exactly `- [x] security-checklist`.

- [ ] Auth decision reviewed — every changed/added handler or action's auth mode
      (`"required"` vs `"public"`) is correct, and "public" isn't just the easier default
- [ ] Input validated — every changed/added handler/action has a real zod schema, or an
      explicit, justified `input: "none"`
- [ ] No secrets logged — no API key, session token, or password appears in a `console.log`,
      error message, or thrown error
- [ ] Migrations are reversible, or the irreversibility is called out explicitly below with
      why it's safe (no silent data loss)
- [ ] Rate limits considered — every changed/added public handler declares a real
      `rateLimit` policy or an explicit, justified `"none"`
- [ ] security-checklist
