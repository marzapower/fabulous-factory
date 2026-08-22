/**
 * Declarative compose lists (npx-installer design spec §5): explicit include lists, no
 * heuristics. `compose.ts` is the engine that reads these; this file holds only data.
 * Every `src` is repo-root-relative, every `dest` is output-root-relative.
 */

export interface CopyEntry {
  src: string;
  dest: string;
  /** Missing source is tolerated (recorded as a warning) instead of throwing. */
  optional?: boolean;
}

/**
 * Base (common infrastructure, shared verbatim — spec §5). `packages/*` (scanned
 * dynamically, EXCLUDING `create`/`create-alias` via `BASE_EXCLUDED_PACKAGES`) and
 * `.prettierrc*` (glob — scanned dynamically) are handled by `compose.ts`, not listed
 * here, since their membership isn't a fixed set.
 */
export const BASE_STATIC_ENTRIES: CopyEntry[] = [
  { src: "eslint.config.mjs", dest: "eslint.config.mjs" },
  { src: ".dependency-cruiser.cjs", dest: ".dependency-cruiser.cjs" },
  { src: "tsconfig.base.json", dest: "tsconfig.base.json" },
  { src: "vitest.config.ts", dest: "vitest.config.ts" },
  { src: "commitlint.config.mjs", dest: "commitlint.config.mjs" },
  { src: ".prettierignore", dest: ".prettierignore", optional: true },
  { src: "pnpm-workspace.yaml", dest: "pnpm-workspace.yaml" },
  { src: ".env.example", dest: ".env.example" },
  { src: ".husky", dest: ".husky" },
  { src: ".github/PULL_REQUEST_TEMPLATE.md", dest: ".github/PULL_REQUEST_TEMPLATE.md" },
  { src: "LICENSE", dest: "LICENSE" },
  { src: ".gitattributes", dest: ".gitattributes" },
  { src: ".devcontainer", dest: ".devcontainer" },
  { src: ".gitleaks.toml", dest: ".gitleaks.toml" },
  { src: ".dockerignore", dest: ".dockerignore" },
  { src: "docs/agents", dest: "docs/agents" },
  { src: "docs/guides", dest: "docs/guides" },
  { src: "docs/templates", dest: "docs/templates" },
  { src: ".claude/skills/fabulous-feature", dest: ".claude/skills/fabulous-feature" },
  { src: ".claude/skills/add-a-job", dest: ".claude/skills/add-a-job" },
  { src: ".claude/agents/fab-warden.md", dest: ".claude/agents/fab-warden.md" },
  { src: ".claude/agents/fab-bastion.md", dest: ".claude/agents/fab-bastion.md" },
  { src: ".claude/agents/fab-medic.md", dest: ".claude/agents/fab-medic.md" },
  { src: "docker-compose.yml", dest: "docker-compose.yml" },
];

/** `packages/*` directory names never copied into the base (the CLI itself). */
export const BASE_EXCLUDED_PACKAGES = ["create", "create-alias"];

/**
 * Repo-root-relative files never copied into the base, even though their parent
 * directory otherwise ships verbatim — maintainer-only tests/docs that assert on THIS
 * repo's own factory-dev shape (payload mirrors, presets, factory agents/skills) and
 * would fail `pnpm check` in every scaffolded product repo, which has none of that.
 * Honored by `composeBase`'s copy filter (see `compose.ts`).
 */
export const BASE_EXCLUDED_FILES = [
  "packages/config/test/factory-docs.test.ts",
  "packages/config/test/factory-agents.test.ts",
  "packages/config/test/launch-checklist-drift.test.ts",
  "docs/guides/release-checklist.md",
];

/** Root-level filename prefix scanned dynamically for the `.prettierrc*` glob. */
export const PRETTIERRC_PREFIX = ".prettierrc";

/** Payload (adopter surface, common to all presets — spec §5). */
export const PAYLOAD_STATIC_ENTRIES: CopyEntry[] = [
  { src: "payload/CLAUDE.md", dest: "CLAUDE.md" },
  { src: "payload/AGENTS.md", dest: "AGENTS.md" },
  { src: "payload/.factory/config.json", dest: ".factory/config.json" },
];

export const PAYLOAD_AGENTS_DIR: CopyEntry = { src: "payload/agents", dest: ".claude/agents" };
export const PAYLOAD_SKILLS_DIR: CopyEntry = { src: "payload/skills", dest: ".claude/skills" };

/** LAUNCH.md merge sources (see `lib/launch-merge.ts` for the merge rule itself). */
export const PAYLOAD_LAUNCH_SRC = "payload/LAUNCH.md";
export const PRESET_LAUNCH_ITEMS_OVERLAY = "overlay/launch-items.md";

/**
 * Root files that cannot be shared with the factory — maintained as adopter variants, not
 * derived by patching (spec §5). Sourced from `payload/variants/*`, required (not
 * `optional`) — every scaffold needs all five.
 */
export const VARIANT_ENTRIES: CopyEntry[] = [
  { src: "payload/variants/package.json", dest: "package.json" },
  { src: "payload/variants/Dockerfile", dest: "Dockerfile" },
  { src: "payload/variants/ci.yml", dest: ".github/workflows/ci.yml" },
  { src: "payload/variants/README.md", dest: "README.md" },
  { src: "payload/variants/gitignore", dest: "gitignore" },
];

/** Preset overlay (spec §5): `PRODUCT.md` seed. */
export const PRESET_PRODUCT_MD_OVERLAY = "overlay/PRODUCT.md";

/** Lockfile capture (spec §5): present only after a release CI run has captured one. */
export const PRESET_LOCKFILE_CAPTURE = "pnpm-lock.captured.yaml";

/** Where every preset's app is renamed to in the output (spec §4). */
export const OUTPUT_APP_DIR = "apps/web";
