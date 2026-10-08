import { describe, expect, it, vi } from "vitest";
import { Secret } from "@/lib/secrets/secret";
import { HttpFigmaClient, type HttpClientOptions } from "./client";
import { FigmaError } from "./errors";

const TOKEN = "figd_test-token-abc";
const KEY = "AbCdEf1234567890XyZ012";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function setup(responses: (Response | Error)[], options: Partial<HttpClientOptions> = {}) {
  const requests: { url: string; headers: Headers }[] = [];
  const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ url: String(url), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  let now = 0;
  const client = new HttpFigmaClient(new Secret(TOKEN), {
    fetchImpl,
    sleep,
    now: () => now,
    cache: new Map(),
    ...options,
  });
  return { client, requests, sleep, fetchImpl, advance: (ms: number) => (now += ms) };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(FigmaError);
    expect((err as Error).message).not.toContain(TOKEN);
    return (err as FigmaError).code;
  }
  throw new Error("expected an error");
};

describe("HttpFigmaClient", () => {
  it("calls only api.figma.com with the token header", async () => {
    const { client, requests } = setup([
      json(200, { id: "1", handle: "me" }),
      json(200, { name: "f" }),
    ]);
    await client.getMe();
    await client.getNodes(KEY, ["1:2", "3:4"]);
    expect(requests.map((r) => r.url)).toEqual([
      "https://api.figma.com/v1/me",
      `https://api.figma.com/v1/files/${KEY}/nodes?ids=1%3A2%2C3%3A4`,
    ]);
    expect(requests[0].headers.get("x-figma-token")).toBe(TOKEN);
  });

  it("validates keys and node ids before sending anything", async () => {
    const { client, fetchImpl } = setup([]);
    expect(await codeOf(client.getFile("../../evil"))).toBe("bad_request");
    expect(await codeOf(client.getFile("https://evil.com/x"))).toBe("bad_request");
    expect(await codeOf(client.getNodes(KEY, ["1:2&ids=x"]))).toBe("bad_request");
    expect(await codeOf(client.getNodes(KEY, []))).toBe("bad_request");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clamps depth and scale", async () => {
    const { client, requests } = setup([json(200, {}), json(200, { images: {} })]);
    await client.getFile(KEY, { depth: 99 });
    await client.getImages(KEY, ["1:2"], { scale: 10 });
    expect(requests[0].url).toBe(`https://api.figma.com/v1/files/${KEY}?depth=10`);
    expect(requests[1].url).toBe(
      `https://api.figma.com/v1/images/${KEY}?ids=1%3A2&format=png&scale=4`,
    );
  });

  it("retries 429 honouring Retry-After, then succeeds", async () => {
    const { client, sleep } = setup([
      json(429, {}, { "retry-after": "7" }),
      json(200, { name: "ok" }),
    ]);
    expect(await client.getStyles(KEY)).toEqual({ name: "ok" });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("caps Retry-After and backs off exponentially on 5xx", async () => {
    const { client, sleep } = setup([
      json(429, {}, { "retry-after": "600" }),
      json(502, {}),
      json(503, {}),
      json(200, {}),
    ]);
    await client.getStyles(KEY);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([60_000, 1000, 2000]);
  });

  it("gives up after retries with rate_limited / server / network", async () => {
    expect(
      await codeOf(
        setup(
          Array(4)
            .fill(0)
            .map(() => json(429, {})),
        ).client.getStyles(KEY),
      ),
    ).toBe("rate_limited");
    expect(
      await codeOf(
        setup(
          Array(4)
            .fill(0)
            .map(() => json(500, {})),
        ).client.getStyles(KEY),
      ),
    ).toBe("server");
    expect(
      await codeOf(
        setup(
          Array(4)
            .fill(0)
            .map(() => new TypeError("fetch failed")),
        ).client.getStyles(KEY),
      ),
    ).toBe("network");
  });

  it.each([
    [401, {}, "getFile", "invalid_token"],
    [403, { status: 403, err: "Invalid token" }, "getFile", "invalid_token"],
    [403, { status: 403, err: "Forbidden" }, "getFile", "no_access"],
    [403, { status: 403, err: "Forbidden" }, "getLocalVariables", "plan_limit"],
    [404, { status: 404, err: "Not found" }, "getFile", "not_found"],
    [400, { status: 400, err: "Bad" }, "getFile", "bad_request"],
  ] as const)("maps %i %j from %s to %s", async (status, body, method, code) => {
    const { client } = setup([json(status, body)]);
    expect(
      await codeOf((client[method] as (k: string) => Promise<unknown>).call(client, KEY)),
    ).toBe(code);
  });

  it("caches per token until the TTL expires, but never caches /me or images", async () => {
    const cache = new Map();
    const a = setup([json(200, { v: 1 }), json(200, { v: 2 })], { cache });
    expect(await a.client.getFile(KEY)).toEqual({ v: 1 });
    expect(await a.client.getFile(KEY)).toEqual({ v: 1 });
    a.advance(5 * 60_000 + 1);
    expect(await a.client.getFile(KEY)).toEqual({ v: 2 });

    const other = new HttpFigmaClient(new Secret("figd_other"), {
      fetchImpl: (async () => json(200, { v: "other" })) as unknown as typeof fetch,
      cache,
      now: () => 0,
    });
    expect(await other.getFile(KEY)).toEqual({ v: "other" });
    expect([...cache.keys()].join(" ")).not.toContain(TOKEN);

    const b = setup([json(200, { id: 1 }), json(200, { id: 2 })], { cache: new Map() });
    await b.client.getMe();
    expect(await b.client.getMe()).toEqual({ id: 2 });
  });

  it("does not follow redirects", async () => {
    const { client, fetchImpl } = setup([json(200, {})]);
    await client.getStyles(KEY);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].redirect).toBe(
      "error",
    );
  });
});
