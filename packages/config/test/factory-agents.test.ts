import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Golden-file style, same REPO_ROOT idiom as factory-docs.test.ts. A malformed agent file is
// not a lint error and not a type error — Claude Code just silently fails to load the agent —
// so this suite is the only thing standing between a stray colon and an agent that quietly
// stops existing.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const AGENTS_DIR = path.join(REPO_ROOT, ".claude", "agents");
const PAYLOAD_AGENTS_DIR = path.join(REPO_ROOT, "payload", "agents");
const PAYLOAD_SKILLS_DIR = path.join(REPO_ROOT, "payload", "skills");

/** Shipped at root: the two factory-dev agents plus the three shared ones. */
const ROOT_AGENT_COUNT = 5;
/** The adopter set, installed into `.claude/agents/` at compose time (packages/create, M3). */
const PAYLOAD_AGENT_COUNT = 4;
/** The adopter set, installed into `.claude/skills/` at compose time (packages/create, M3). */
const PAYLOAD_SKILL_COUNT = 7;

/**
 * Factory-dev-only agents — never shipped to adopters (spec §5, "Never shipped"). Lives here
 * as a literal, not an import, since there is no runtime module that owns this list yet;
 * `packages/create`'s `compose.config.ts` (M3) becomes the single source of truth once it
 * exists.
 */
const FACTORY_DEV_ONLY_AGENTS = ["fab-forge", "fab-steward"];

/** Factory-dev-only skills — never shipped to adopters, same "Never shipped" tiering. */
const FACTORY_DEV_ONLY_SKILLS = ["add-integration-package", "write-adr", "release-template"];

const NAME_PATTERN = /^fab-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_MODELS = ["opus", "sonnet", "haiku", "inherit"];

interface Frontmatter {
  keys: Record<string, string>;
  body: string;
  /** Non-blank lines inside the fence, so a test can prove none was silently dropped. */
  rawLineCount: number;
}

/**
 * Minimal frontmatter reader — three fields do not justify a YAML dependency.
 *
 * Anchored at the start of the file and non-greedy on purpose: a body containing a markdown
 * horizontal rule must not be mistaken for the closing fence. Values are split on the FIRST
 * colon only, because a legitimate description can contain one (`pnpm factory:init` appears in
 * add-a-job's).
 */
function parseFrontmatter(content: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return null;

  const keys: Record<string, string> = {};
  let rawLineCount = 0;
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    rawLineCount += 1;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    keys[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { keys, body: match[2], rawLineCount };
}

function listAgentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

function listSkillDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function describeAgentDir(label: string, dir: string, expectedCount: number): void {
  const files = listAgentFiles(dir);

  describe(`${label} — agent definitions`, () => {
    // Without this, every per-file assertion below would pass vacuously on an empty directory —
    // which is exactly what a wrong REPO_ROOT or a botched move would produce.
    it(`ships exactly ${expectedCount} agents`, () => {
      expect(files).toHaveLength(expectedCount);
    });

    for (const file of files) {
      describe(file, () => {
        const content = readFileSync(path.join(dir, file), "utf8");
        const parsed = parseFrontmatter(content);

        it("has a parseable frontmatter block", () => {
          expect(parsed).not.toBeNull();
        });

        it("declares a name matching the filename and the fab- convention", () => {
          const name = parsed?.keys.name ?? "";
          expect(name).toMatch(NAME_PATTERN);
          expect(name).toBe(file.replace(/\.md$/, ""));
        });

        it("declares a non-empty description", () => {
          expect(parsed?.keys.description ?? "").not.toBe("");
        });

        it("has no frontmatter line the parser silently dropped", () => {
          // Every non-blank line inside the fence must have produced a key. A folded scalar
          // ("description: >" plus indented continuation lines) would otherwise parse to ">",
          // pass every other assertion here, and load as a one-character description.
          expect(parsed?.rawLineCount).toBe(Object.keys(parsed?.keys ?? {}).length);
        });

        it("keeps ': ' out of the unquoted description", () => {
          // An unquoted YAML scalar containing ": " is a mapping, not a string — the file
          // parses as something else entirely and the agent never loads. All 13 shipped
          // SKILL.md descriptions avoid it; so must every agent.
          expect(parsed?.keys.description ?? "").not.toContain(": ");
        });

        it("declares a known model", () => {
          expect(VALID_MODELS).toContain(parsed?.keys.model ?? "");
        });

        it("has no bare '---' line in the body", () => {
          // Would read as a second frontmatter fence to a less careful parser than ours.
          const bodyLines = (parsed?.body ?? "").split(/\r?\n/);
          expect(bodyLines.filter((line) => line.trim() === "---")).toHaveLength(0);
        });
      });
    }
  });
}

describeAgentDir(".claude/agents", AGENTS_DIR, ROOT_AGENT_COUNT);
describeAgentDir("payload/agents", PAYLOAD_AGENTS_DIR, PAYLOAD_AGENT_COUNT);

describe("agent tiers", () => {
  it("names every factory-dev-only agent as a file that actually exists", () => {
    for (const name of FACTORY_DEV_ONLY_AGENTS) {
      expect(existsSync(path.join(AGENTS_DIR, `${name}.md`))).toBe(true);
    }
  });

  it("keeps root and payload agent names disjoint", () => {
    // A payload agent shadowing a root one would be ambiguous about which instructions an
    // adopter actually gets once compose installs it into `.claude/agents/`.
    const rootNames = new Set(listAgentFiles(AGENTS_DIR));
    const collisions = listAgentFiles(PAYLOAD_AGENTS_DIR).filter((name) => rootNames.has(name));
    expect(collisions).toEqual([]);
  });

  it("never ships a factory-dev-only agent under payload/agents", () => {
    for (const name of FACTORY_DEV_ONLY_AGENTS) {
      expect(existsSync(path.join(PAYLOAD_AGENTS_DIR, `${name}.md`))).toBe(false);
    }
  });
});

describe("payload/skills — adopter skill set", () => {
  const skillDirs = listSkillDirs(PAYLOAD_SKILLS_DIR);

  it(`ships exactly ${PAYLOAD_SKILL_COUNT} skills`, () => {
    expect(skillDirs).toHaveLength(PAYLOAD_SKILL_COUNT);
  });

  it("never ships a factory-dev-only skill", () => {
    for (const name of FACTORY_DEV_ONLY_SKILLS) {
      expect(skillDirs).not.toContain(name);
    }
  });
});
