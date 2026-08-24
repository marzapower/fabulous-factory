import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Capabilities, Env } from "@factory/config";

const mockedInngestConstructor = vi.fn();

vi.mock("inngest", () => ({
  Inngest: class {
    constructor(config: unknown) {
      mockedInngestConstructor(config);
    }
  },
}));

/**
 * Unit coverage for the `fetch` override the module-scope `new Inngest({...})` (`../src/
 * client`) supplies — conventions.md's "every external call carries an explicit timeout"
 * rule, satisfied here via `AbortSignal.timeout(10_000)` composed onto every request the
 * SDK makes. No real network call, no live Inngest server: `@factory/config` is mocked so
 * module-load construction of the client is deterministic, and `timeoutFetch` is tested
 * directly against an injected never-resolving `fetch`.
 */
vi.mock("@factory/config", () => ({
  getEnv: vi.fn(),
  getCapabilities: vi.fn(),
}));

import { getCapabilities, getEnv } from "@factory/config";

const mockedGetEnv = vi.mocked(getEnv);
const mockedGetCapabilities = vi.mocked(getCapabilities);

const BASE_CAPABILITIES: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

beforeEach(() => {
  vi.resetModules();
  mockedInngestConstructor.mockClear();
  mockedGetEnv.mockReturnValue({} as Env);
  mockedGetCapabilities.mockReturnValue(BASE_CAPABILITIES);
});

describe("inngest client construction", () => {
  it("constructs the module-scope Inngest client with fetch set to the exported timeoutFetch", async () => {
    const { inngest, timeoutFetch } = await import("../src/client");

    expect(inngest).toBeDefined();
    expect(mockedInngestConstructor).toHaveBeenCalledTimes(1);
    const [config] = mockedInngestConstructor.mock.calls[0] as [{ fetch: unknown }];
    expect(config.fetch).toBe(timeoutFetch);
  });
});

describe("timeoutFetch", () => {
  it("rejects a hung transport once the bound elapses", async () => {
    // `AbortSignal.timeout()` is implemented on Node's native timer plumbing, not the
    // patchable `globalThis.setTimeout` — vitest's fake timers don't advance it, so the
    // bound is injected small via `makeTimeoutFetch` instead of waiting out the real
    // 10s production value (`timeoutFetch` is `makeTimeoutFetch(10_000)` by construction).
    const { makeTimeoutFetch } = await import("../src/client");
    const boundedFetch = makeTimeoutFetch(25);

    // A fetch that hangs unless its signal aborts — mirroring the real `fetch` contract
    // (which rejects with an AbortError once the passed signal fires) rather than
    // literally never settling, since only the signal can end this promise.
    const neverResolvingFetch = vi.fn((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", neverResolvingFetch);

    await expect(boundedFetch("https://inn.gs/e/test")).rejects.toThrow();

    vi.unstubAllGlobals();
  });

  it("passes an AbortSignal through to the underlying fetch call", async () => {
    const { timeoutFetch } = await import("../src/client");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);

    await timeoutFetch("https://inn.gs/e/test", { method: "POST" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.method).toBe("POST");

    vi.unstubAllGlobals();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
