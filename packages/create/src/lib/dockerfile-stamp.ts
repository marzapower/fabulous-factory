/**
 * Adopter Dockerfile domain-package-manifest stamp (npx-installer design spec §5, per-preset
 * package pruning): `payload/variants/Dockerfile` carries an explicit insertion marker line
 * in place of the domain packages' `COPY .../package.json` lines (which vary per preset —
 * a fixed adopter Dockerfile can't hardcode them). Pure string logic — no filesystem I/O —
 * mirrors `launch-merge.ts`'s marker style: throws if the marker isn't present.
 */
export const DOCKERFILE_DOMAIN_PACKAGE_MARKER = "# preset:domain-package-manifests";

/**
 * Replaces the marker line in `dockerfile` with one
 * `COPY packages/<pkg>/package.json packages/<pkg>/package.json` line per entry in
 * `domainPackages`, in the given order. An empty `domainPackages` removes the marker line
 * entirely (no domain package manifest to COPY). Throws if the marker line isn't present —
 * a missing marker means `payload/variants/Dockerfile` was edited without preserving the
 * insertion point, which every preset compose depends on.
 */
export function stampDockerfileDomainPackages(
  dockerfile: string,
  domainPackages: string[],
  marker: string = DOCKERFILE_DOMAIN_PACKAGE_MARKER,
): string {
  const lines = dockerfile.split("\n");
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  if (markerIndex === -1) {
    throw new Error(`Dockerfile is missing the "${marker}" insertion marker.`);
  }

  const replacement = domainPackages.map(
    (pkg) => `COPY packages/${pkg}/package.json packages/${pkg}/package.json`,
  );
  lines.splice(markerIndex, 1, ...replacement);
  return lines.join("\n");
}
