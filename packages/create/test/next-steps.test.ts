import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import { OUTRO_LINE, renderNextSteps } from "../src/lib/next-steps";

function render(ctx: Partial<Parameters<typeof renderNextSteps>[0]> = {}): string {
  return stripVTControlCharacters(
    renderNextSteps({
      projectName: "my-app",
      depsInstalled: true,
      gitStatus: "initialized",
      dockerAvailable: true,
      ...ctx,
    }),
  );
}

describe("renderNextSteps", () => {
  it("always starts with cd and ends with pnpm dev", () => {
    const out = render();
    expect(out).toMatch(/^1\. cd my-app/);
    expect(out).toContain("pnpm dev  # migrations self-apply");
  });

  it("includes pnpm install when deps were not installed", () => {
    expect(render({ depsInstalled: false })).toContain("pnpm install");
  });

  it("omits pnpm install when deps were already installed", () => {
    expect(render({ depsInstalled: true })).not.toContain("pnpm install");
  });

  it("shows the docker variant with the resolved DATABASE_URL when docker is available", () => {
    const out = render({ dockerAvailable: true });
    expect(out).toContain("docker compose up -d db");
    expect(out).toContain("start Docker first");
    expect(out).toContain("then set DATABASE_URL in .env to");
    expect(out).toContain("postgres://postgres:postgres@localhost:5432/postgres");
    expect(out).toContain("(port follows DB_PORT if you set it)");
  });

  it("shows the generic DATABASE_URL instruction when docker is unavailable", () => {
    const out = render({ dockerAvailable: false });
    expect(out).toContain("set DATABASE_URL in .env");
    expect(out).toContain("any reachable Postgres");
    expect(out).toContain("no Postgres? install Docker, then: docker compose up -d db");
    expect(out).not.toContain("postgres://postgres:postgres@localhost:5432/postgres");
  });

  it("keeps every rendered line at or under 70 visible characters", () => {
    for (const ctx of [{ dockerAvailable: true }, { dockerAvailable: false }] as const) {
      for (const line of render(ctx).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(70);
      }
    }
  });

  it("adds a failed-git-init hint when git init failed", () => {
    const out = render({ gitStatus: "failed" });
    expect(out).toContain("git init failed");
    expect(out).toContain(
      'git init && git add -A && git commit -m "chore: scaffold from fabulous-factory"',
    );
  });

  it("adds a git-not-installed hint when git is unavailable", () => {
    const out = render({ gitStatus: "unavailable" });
    expect(out).toContain("git isn't installed");
    expect(out).toContain(
      'git init && git add -A && git commit -m "chore: scaffold from fabulous-factory"',
    );
  });

  it("omits any git hint when git was initialized", () => {
    const out = render({ gitStatus: "initialized" });
    expect(out).not.toContain("git init failed");
    expect(out).not.toContain("git isn't installed");
  });

  it("omits any git hint when git init was declined", () => {
    const out = render({ gitStatus: "declined" });
    expect(out).not.toContain("git init failed");
    expect(out).not.toContain("git isn't installed");
  });

  it("always mentions cp .env.example .env and the BETTER_AUTH_SECRET step", () => {
    const out = render();
    expect(out).toContain("cp .env.example .env");
    expect(out).toContain("openssl rand -hex 32  # paste as BETTER_AUTH_SECRET in .env");
  });

  it("has no trailing newline", () => {
    expect(render()).not.toMatch(/\n$/);
    expect(render({ gitStatus: "failed" })).not.toMatch(/\n$/);
  });
});

describe("OUTRO_LINE", () => {
  it("is a non-empty string that points the adopter at their agent", () => {
    expect(typeof OUTRO_LINE).toBe("string");
    expect(OUTRO_LINE.length).toBeGreaterThan(0);
    expect(stripVTControlCharacters(OUTRO_LINE)).toMatch(/agent/i);
  });
});
