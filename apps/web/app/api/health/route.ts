// TODO(M3): migrate to defineHandler once packages/core exists.
//
// Liveness only (design spec §12): the full capability map is recon data for an
// attacker and is exposed only via `pnpm factory:doctor`, never over this public HTTP endpoint.
export async function GET() {
  return Response.json({ status: "ok" });
}
