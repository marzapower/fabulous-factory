import { buildAccountExport } from "@factory/auth";
import { defineHandler } from "@factory/core";
import { exportUserData } from "@factory/untangle";

export const dynamic = "force-dynamic";

export const GET = defineHandler({
  auth: "required",
  input: "none",
  // A generous but bounded per-user ceiling — this is a manual, occasional action (the
  // "Download your data" button in Settings), not a polled endpoint, but it still must
  // never be unlimited (kernel rule). Mirrors the window shape of other authenticated
  // GETs in this app; the low max is what actually matters here.
  rateLimit: { windowSeconds: 60, max: 5 },
  handler: async ({ session }) => {
    const userId = session.user.id;

    const payload = {
      ...(await buildAccountExport(userId)),
      untangle: await exportUserData(userId),
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json",
        // A personal-data dump must never land in any cache — force-dynamic already keeps
        // Next from caching it, but the explicit header covers proxies/browsers too.
        "cache-control": "private, no-store",
        "content-disposition": 'attachment; filename="account-export.json"',
      },
    });
  },
});
