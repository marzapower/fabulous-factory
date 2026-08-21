# SPEC: <feature name>

One job to be done. If this SPEC needs "and" to describe its purpose, split it.

## Job to be done

Who is doing what, and why. One or two sentences — the sentence a user would say, not a
feature list.

> e.g. "As a signed-up user, I want to add a URL and get notified when it changes, so I
> don't have to check it manually."

## Primary flow

Numbered steps, happy path only, from trigger to outcome. Name the actual routes,
actions, or jobs involved where you already know them.

1. …
2. …
3. …

## Error states

Every way the primary flow can fail, and what the user sees or gets instead. Include
degraded-service cases explicitly (see `docs/agents/conventions.md` — graceful
degradation): what happens to this flow when an optional service this feature depends on
is disabled?

- …

## Acceptance tests

Concrete, checkable conditions — the ones a reviewer (human or agent) runs to call this
done. Prefer "given/when/then" phrasing that maps directly onto a vitest test name.

- [ ] …
- [ ] …

## Kill criteria

What would tell you this feature was the wrong bet — a metric, a piece of user feedback,
or a technical wall — and what you'd do about it (cut it, redesign it, ship it anyway and
note why). Write this now, while you're not attached to the outcome yet.
