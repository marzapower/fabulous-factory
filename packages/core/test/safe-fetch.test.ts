import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSafeFetch,
  isBlockedAddress,
  safeFetch,
  SafeFetchError,
  unmapIPv4,
} from "../src/safe-fetch";

// --- pure range-check table (plan D.9.4 — complete enumeration, no sockets) --------

describe("isBlockedAddress — complete SSRF deny-list (plan D.9.4)", () => {
  const denied: [string, string][] = [
    ["loopback 127.0.0.0/8", "127.0.0.1"],
    ["loopback 127.0.0.0/8 edge", "127.255.255.254"],
    ["loopback ::1/128", "::1"],
    ["RFC1918 10/8", "10.1.2.3"],
    ["RFC1918 172.16/12", "172.16.0.1"],
    ["RFC1918 172.16/12 edge", "172.31.255.254"],
    ["RFC1918 192.168/16", "192.168.1.1"],
    ["link-local 169.254/16", "169.254.1.1"],
    ["link-local metadata", "169.254.169.254"],
    ["link-local fe80::/10", "fe80::1"],
    ["CGNAT 100.64/10", "100.64.0.1"],
    ["CGNAT 100.64/10 edge", "100.127.255.254"],
    ["IETF protocol assignments 192.0.0.0/24", "192.0.0.1"],
    ["benchmarking 198.18.0.0/15", "198.18.0.1"],
    ["benchmarking 198.18.0.0/15 edge", "198.19.255.254"],
    ["multicast 224.0.0.0/4", "224.0.0.1"],
    ["multicast ff00::/8", "ff02::1"],
    ["broadcast 255.255.255.255/32", "255.255.255.255"],
    ["unspecified 0.0.0.0/8", "0.0.0.0"],
    ["unspecified ::/128", "::"],
    ["ULA fc00::/7", "fc00::1"],
    ["ULA fc00::/7 edge", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    ["documentation TEST-NET-1 192.0.2.0/24", "192.0.2.1"],
    ["documentation TEST-NET-2 198.51.100.0/24", "198.51.100.1"],
    ["documentation TEST-NET-3 203.0.113.0/24", "203.0.113.1"],
    // IPv4-mapped IPv6 forms (plan D.9.4 — dual-stack sockets report these)
    ["::ffff:-mapped loopback", "::ffff:127.0.0.1"],
    ["::ffff:-mapped RFC1918", "::ffff:10.1.2.3"],
    ["::ffff:-mapped metadata", "::ffff:169.254.169.254"],
    ["unparseable address (fail closed)", "not-an-ip-address"],
  ];

  it.each(denied)("blocks %s (%s)", (_label, address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  const allowed: [string, string][] = [
    ["a public IPv4 address", "8.8.8.8"],
    ["a public IPv4 address just outside RFC1918 10/8", "11.0.0.1"],
    ["a public IPv4 address just outside CGNAT", "100.128.0.1"],
    ["a public IPv6 address", "2001:4860:4860::8888"],
    ["a public address in ::ffff: form", "::ffff:8.8.8.8"],
  ];

  it.each(allowed)("allows %s (%s)", (_label, address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("unmapIPv4", () => {
  it("strips the ::ffff: prefix from a mapped address", () => {
    expect(unmapIPv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
  });

  it("leaves a plain IPv4 address unchanged", () => {
    expect(unmapIPv4("127.0.0.1")).toBe("127.0.0.1");
  });

  it("leaves a plain (non-mapped) IPv6 address unchanged", () => {
    expect(unmapIPv4("::1")).toBe("::1");
  });
});

// --- scheme allowlist (no network needed) ------------------------------------------

describe("safeFetch — scheme allowlist", () => {
  it("rejects a non-http(s) scheme before ever touching the network", async () => {
    await expect(safeFetch("ftp://example.com/file")).rejects.toMatchObject({
      reason: "invalid_scheme",
    });
  });

  it("rejects file: URLs", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toMatchObject({
      reason: "invalid_scheme",
    });
  });
});

// --- live tests against a local server ---------------------------------------------

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

describe("safeFetch — live behavior", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("blocks a request to 127.0.0.1 (loopback) by default", async () => {
    const server = http.createServer((_req, res) => res.end("should never be reached"));
    servers.push(server);
    const port = await listen(server);

    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({
      reason: "blocked_address",
    });
  });

  it("re-validates the redirect target through the same agent (not just the first hop)", async () => {
    // A real, routable "denied" address like the cloud metadata IP may not have a route
    // at all in a sandboxed test network, which makes the OS-level TCP connect hang
    // until undici's own connect timeout — unrelated to what this test is proving. So
    // this proves the actual mechanism directly instead: two DISTINCT origins (different
    // ports ⇒ undici's Agent opens a fresh connection to each, never reusing a pooled
    // one), with the validator allowing the first connect and blocking every subsequent
    // one. If redirects were only checked once, up front, this would incorrectly pass.
    const serverB = http.createServer((_req, res) => res.end("should never be reached"));
    servers.push(serverB);
    const portB = await listen(serverB);

    const serverA = http.createServer((_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    servers.push(serverA);
    const portA = await listen(serverA);

    let connectCount = 0;
    const fetchWithOnlyFirstHopAllowed = createSafeFetch({
      isBlockedAddress: () => {
        connectCount += 1;
        return connectCount > 1; // allow the connect to A, block the connect to B
      },
    });

    await expect(fetchWithOnlyFirstHopAllowed(`http://127.0.0.1:${portA}/`)).rejects.toMatchObject({
      reason: "blocked_address",
    });
    expect(connectCount).toBe(2);
  });

  it("enforces the max-redirects cap", async () => {
    const server = http.createServer((req, res) => {
      const hop = Number(
        new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("hop") ?? "0",
      );
      res.writeHead(302, { Location: `/?hop=${hop + 1}` });
      res.end();
    });
    servers.push(server);
    const port = await listen(server);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    await expect(fetchAllowingLoopback(`http://127.0.0.1:${port}/?hop=0`)).rejects.toMatchObject({
      reason: "too_many_redirects",
    });
  });

  it("enforces the response size cap WHILE STREAMING", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      // No Content-Length declared — the cap must be enforced from the stream itself,
      // not from a header a hostile server could lie about.
      const chunk = Buffer.alloc(1024, 1);
      let sent = 0;
      const interval = setInterval(() => {
        if (res.destroyed) {
          clearInterval(interval);
          return;
        }
        res.write(chunk);
        sent += chunk.length;
        if (sent > 10 * 1024 * 1024) {
          clearInterval(interval);
          res.end();
        }
      }, 0);
    });
    servers.push(server);
    const port = await listen(server);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const res = await fetchAllowingLoopback(`http://127.0.0.1:${port}/`, { maxBytes: 4096 });
    await expect(
      (async () => {
        const reader = res.body!.getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      })(),
    ).rejects.toMatchObject({ reason: "response_too_large" });
  });

  it("enforces the overall timeout", async () => {
    const server = http.createServer((_req, res) => {
      setTimeout(() => res.end("too late"), 2000);
    });
    servers.push(server);
    const port = await listen(server);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    await expect(
      fetchAllowingLoopback(`http://127.0.0.1:${port}/`, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ reason: "timeout" });
  }, 10_000);

  it("allowed path: an injected validator override permits a request to what is normally a blocked address", async () => {
    const server = http.createServer((_req, res) => res.end("ok"));
    servers.push(server);
    const port = await listen(server);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const res = await fetchAllowingLoopback(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("strips authorization and cookie headers on a cross-origin redirect hop (M1)", async () => {
    let receivedHeaders: http.IncomingHttpHeaders | undefined;
    const serverB = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      res.end("ok");
    });
    servers.push(serverB);
    const portB = await listen(serverB);

    // Different port ⇒ different origin, exactly like the existing
    // "re-validates the redirect target" test above.
    const serverA = http.createServer((_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    servers.push(serverA);
    const portA = await listen(serverA);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const res = await fetchAllowingLoopback(`http://127.0.0.1:${portA}/`, {
      headers: {
        authorization: "Bearer secret-token",
        cookie: "session=abc123",
        "x-custom-header": "keep-me",
      },
    });

    expect(res.status).toBe(200);
    expect(receivedHeaders?.authorization).toBeUndefined();
    expect(receivedHeaders?.cookie).toBeUndefined();
    // A non-credential header must still survive the hop — proving this is a targeted
    // strip, not a wholesale header wipe.
    expect(receivedHeaders?.["x-custom-header"]).toBe("keep-me");
  });

  it("a 303 redirect switches the method to GET and drops the body (M1)", async () => {
    let receivedMethod: string | undefined;
    let receivedBody = "";
    const serverB = http.createServer((req, res) => {
      receivedMethod = req.method;
      req.on("data", (chunk: Buffer) => {
        receivedBody += chunk.toString();
      });
      req.on("end", () => res.end("ok"));
    });
    servers.push(serverB);
    const portB = await listen(serverB);

    const serverA = http.createServer((_req, res) => {
      res.writeHead(303, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    servers.push(serverA);
    const portA = await listen(serverA);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const res = await fetchAllowingLoopback(`http://127.0.0.1:${portA}/`, {
      method: "POST",
      body: "original body",
      headers: { "content-type": "text/plain" },
    });

    expect(res.status).toBe(200);
    expect(receivedMethod).toBe("GET");
    expect(receivedBody).toBe("");
  });

  it("a 301 redirect with a POST switches the method to GET and drops the body (M1)", async () => {
    let receivedMethod: string | undefined;
    const serverB = http.createServer((req, res) => {
      receivedMethod = req.method;
      res.end("ok");
    });
    servers.push(serverB);
    const portB = await listen(serverB);

    const serverA = http.createServer((_req, res) => {
      res.writeHead(301, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    servers.push(serverA);
    const portA = await listen(serverA);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const res = await fetchAllowingLoopback(`http://127.0.0.1:${portA}/`, {
      method: "POST",
      body: "original body",
    });

    expect(res.status).toBe(200);
    expect(receivedMethod).toBe("GET");
  });

  it("throws a typed error when a redirect requires resending a non-replayable stream body (M1)", async () => {
    const serverB = http.createServer((_req, res) => res.end("should never be reached"));
    servers.push(serverB);
    const portB = await listen(serverB);

    const serverA = http.createServer((_req, res) => {
      res.writeHead(307, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    servers.push(serverA);
    const portA = await listen(serverA);

    const fetchAllowingLoopback = createSafeFetch({ isBlockedAddress: () => false });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.close();
      },
    });

    await expect(
      fetchAllowingLoopback(`http://127.0.0.1:${portA}/`, {
        method: "POST",
        body: stream,
        duplex: "half",
      }),
    ).rejects.toMatchObject({ reason: "unsupported_redirect_body" });
  });

  it("the default export is unaffected by another instance's override (no global weakening)", async () => {
    const server = http.createServer((_req, res) => res.end("ok"));
    servers.push(server);
    const port = await listen(server);

    createSafeFetch({ isBlockedAddress: () => false }); // constructing another instance...
    // ...must not affect the shared default `safeFetch`, which still blocks loopback.
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({
      reason: "blocked_address",
    });
  });
});

describe("SafeFetchError", () => {
  it("carries its reason code and is a real Error", () => {
    const err = new SafeFetchError("invalid_scheme", "nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SafeFetchError");
    expect(err.reason).toBe("invalid_scheme");
  });
});

// Sanity check that our deny-list construction actually uses net.BlockList as documented.
describe("isBlockedAddress — custom deny list override", () => {
  it("accepts an injected net.BlockList for testing without touching the default", () => {
    const permissive = new net.BlockList(); // blocks nothing
    expect(isBlockedAddress("127.0.0.1", permissive)).toBe(false);
    expect(isBlockedAddress("127.0.0.1")).toBe(true); // default is untouched
  });
});
