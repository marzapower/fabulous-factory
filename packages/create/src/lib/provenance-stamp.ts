/**
 * Install-time provenance stamp (ADR-0006): rewrites the scaffolded repo's
 * `.factory/config.json` from the compose-time seed (`{ stage: "prototype" }`, see
 * `compose.config.ts`'s `PAYLOAD_STATIC_ENTRIES`) into `{ stage, preset, factoryVersion }`
 * — the shape `factory-sync.ts` (running later, inside the scaffolded repo) reads to know
 * which version it was scaffolded from and which preset it is, without asking the adopter.
 *
 * Preserves whatever `stage` was already there (`factory:status`/`preflight` may have
 * flipped it to `"production"` by the time this ever runs again — though in practice this
 * only ever runs once, at install time, straight after the compose-time seed). Missing or
 * unparseable `stage` degrades to `"prototype"`, mirroring `factory-stage.ts`'s
 * `loadFactoryConfig` — never throws.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface StampProvenanceOptions {
  preset: string;
  factoryVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads `<targetDir>/.factory/config.json`'s `stage`, defaulting to `"prototype"` on any
 * missing/unparseable/invalid input — same defensive posture as `factory-stage.ts`. */
function readExistingStage(configPath: string): unknown {
  if (!existsSync(configPath)) return "prototype";
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!isRecord(parsed)) return "prototype";
    return parsed.stage === "production" ? "production" : "prototype";
  } catch {
    return "prototype";
  }
}

/**
 * Rewrites `<targetDir>/.factory/config.json` to `{ stage, preset, factoryVersion }`,
 * preserving the existing `stage`. Called from `install.ts` right after the copy step,
 * same as `stampProjectName`/`stampDockerfileDomainPackages` — never throws on a missing
 * or malformed pre-existing file, since the file it's stamping is always the compose-time
 * seed shipped by this very package.
 */
export function stampProvenance(targetDir: string, opts: StampProvenanceOptions): void {
  const configPath = path.join(targetDir, ".factory", "config.json");
  const stage = readExistingStage(configPath);
  const stamped = { stage, preset: opts.preset, factoryVersion: opts.factoryVersion };
  writeFileSync(configPath, `${JSON.stringify(stamped, null, 2)}\n`);
}
