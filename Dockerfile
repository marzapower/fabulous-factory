# syntax=docker/dockerfile:1
#
# Multi-stage build for the Fabulous Factory monorepo.
#
#   docker build .                               -> runtime image (default/last stage)
#   docker build --target runner .                -> runtime image (explicit)
#   docker build --target migrate .                -> one-shot migrator image
#
# See docs/superpowers/plans/milestones/m8-docker-deploy.md §I.4 for the contract.

# ---------------------------------------------------------------------------
# base: shared toolchain layer for both the app build and the migrate build.
# ---------------------------------------------------------------------------
FROM node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Wire the pnpm store BEFORE any install so the BuildKit cache mount below is real
# (corepack pnpm otherwise defaults the store under the user home, and a
# --mount=target=/pnpm/store would cache an empty directory every build).
RUN pnpm config set store-dir /pnpm/store

# ---------------------------------------------------------------------------
# deps: install once, from manifests only, so source-only changes don't bust
# the install cache. Never re-run in builder.
# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/brainstorm/package.json apps/brainstorm/package.json
COPY apps/nothing/package.json apps/nothing/package.json
COPY apps/untangle/package.json apps/untangle/package.json
COPY packages/analytics/package.json packages/analytics/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/brainstorm/package.json packages/brainstorm/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/create/package.json packages/create/package.json
COPY packages/create-alias/package.json packages/create-alias/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/untangle/package.json packages/untangle/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# ---------------------------------------------------------------------------
# builder: overlay real source and build the Next.js standalone output.
# ---------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app ./
COPY . .

# Placeholder build-time values only — both required at runtime, neither is real.
# `getEnv()` runs at module scope (packages/auth/src/auth.ts:54) during Next's
# page-data collection, so a missing value fails `pnpm build` outright. Neither
# placeholder reaches a shipped image: runner/migrate stages `FROM base` fresh.
ARG DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ARG BETTER_AUTH_SECRET=build-placeholder-secret-not-real
ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}

RUN pnpm build

# ---------------------------------------------------------------------------
# migrate-deploy: materialize a standalone, production-only copy of @factory/db
# for the migrate image (kept separate from `builder` so the runtime image
# never depends on it).
# ---------------------------------------------------------------------------
FROM base AS migrate-deploy

COPY --from=deps /app ./
COPY . .

RUN pnpm deploy --legacy --filter @factory/db --prod /prod/db

# ---------------------------------------------------------------------------
# migrate: one-shot migrator image. Non-root, no dev toolchain beyond tsx.
# ---------------------------------------------------------------------------
FROM node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS migrate

ENV NODE_ENV=production
WORKDIR /app

RUN npm install -g tsx@4.23.12 && npm cache clean --force

RUN addgroup -g 1001 -S migrator && adduser -u 1001 -S migrator -G migrator

COPY --from=migrate-deploy --chown=migrator:migrator /prod/db ./

USER migrator

CMD ["tsx", "scripts/migrate.ts"]

# ---------------------------------------------------------------------------
# runner: default/last stage, so a plain `docker build .` yields this image.
# Standalone Next.js server, non-root, wget-based HEALTHCHECK (no curl in
# alpine's busybox).
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/apps/untangle/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/untangle/.next/static ./apps/untangle/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "apps/untangle/server.js"]
