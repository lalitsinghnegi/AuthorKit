import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  MAX_REDIRECTS,
  SiteReader,
  safeLookup,
  type RawResponse,
  type Resolve,
  type Transport,
} from "./fetch";

const HOST = "www.acme.com";
const PUBLIC: Resolve = async () => [{ address: "93.184.215.14", family: 4 }];
const html = (body = "<p>hi</p>", headers: Partial<RawResponse["headers"]> = {}): RawResponse => ({
  status: 200,
  headers: { contentType: "text/html; charset=utf-8", ...headers },
  body: Buffer.from(body),
});

/** A transport that resolves the host through `lookup` (like the real one), then answers in order. */
function fake(responses: (RawResponse | Error)[]) {
  const requested: string[] = [];
  const transport: Transport = async (url, { lookup }) => {
    await new Promise<void>((resolve, reject) =>
      lookup(url.hostname, {}, (err) => (err ? reject(err) : resolve())),
    );
    requested.push(url.href);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, requested };
}

const reader = (transport: Transport, resolve: Resolve = PUBLIC, extra = {}) =>
  new SiteReader({ transport, resolve, cache: new Map(), ...extra });

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? String(e),
  );

describe("SiteReader", () => {
  it("reads an HTML page and decodes gzip and the charset", async () => {
    const { transport } = fake([
      {
        status: 200,
        headers: { contentType: "text/html; charset=iso-8859-1", contentEncoding: "gzip" },
        body: gzipSync(Buffer.from("<p>caf\xe9</p>", "latin1")),
      },
    ]);
    const page = await reader(transport).readPage(`https://${HOST}/en.html#top`, HOST);
    expect(page).toEqual({ url: `https://${HOST}/en.html`, html: "<p>café</p>" });
  });

  it.each([
    ["ftp://www.acme.com/", "bad_url"],
    ["https://user:pw@www.acme.com/", "bad_url"],
    ["https://www.acme.com:8443/", "bad_port"],
    ["https://evil.example/", "wrong_host"],
    ["not a url", "bad_url"],
  ])("refuses %s before any request (%s)", async (url, code) => {
    const { transport, requested } = fake([html()]);
    expect(await codeOf(reader(transport).readPage(url, HOST))).toBe(code);
    expect(requested).toEqual([]);
  });

  it("refuses IP literals that are not public", async () => {
    for (const host of ["127.0.0.1", "169.254.169.254", "[::1]"]) {
      const { transport, requested } = fake([html()]);
      expect(await codeOf(reader(transport).readPage(`http://${host}/`, host))).toBe(
        "blocked_address",
      );
      expect(requested).toEqual([]);
    }
  });

  it("refuses names that resolve to any private address", async () => {
    const mixed: Resolve = async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    const { transport, requested } = fake([html()]);
    expect(await codeOf(reader(transport, mixed).readPage(`https://${HOST}/`, HOST))).toBe(
      "blocked_address",
    );
    expect(requested).toEqual([]);
  });

  it("follows same-site redirects, including http to https", async () => {
    const { transport, requested } = fake([
      { status: 301, headers: { location: `https://${HOST}/en.html` }, body: Buffer.alloc(0) },
      { status: 302, headers: { location: "/en/home.html" }, body: Buffer.alloc(0) },
      html("<p>home</p>"),
    ]);
    const page = await reader(transport).readPage(`http://${HOST}/`, HOST);
    expect(page.url).toBe(`https://${HOST}/en/home.html`);
    expect(requested).toEqual([
      `http://${HOST}/`,
      `https://${HOST}/en.html`,
      `https://${HOST}/en/home.html`,
    ]);
  });

  it("does not follow redirects to other hosts or too many times", async () => {
    const off = fake([
      {
        status: 302,
        headers: { location: "http://169.254.169.254/latest" },
        body: Buffer.alloc(0),
      },
    ]);
    expect(await codeOf(reader(off.transport).readPage(`https://${HOST}/`, HOST))).toBe(
      "wrong_host",
    );
    expect(off.requested).toHaveLength(1);

    const loop = fake(
      Array.from({ length: MAX_REDIRECTS + 1 }, () => ({
        status: 302,
        headers: { location: "/again" },
        body: Buffer.alloc(0),
      })),
    );
    expect(await codeOf(reader(loop.transport).readPage(`https://${HOST}/`, HOST))).toBe(
      "too_many_redirects",
    );
  });

  it.each([
    [{ ...html(), status: 404 }, "http_status"],
    [html("{}", { contentType: "application/json" }), "not_html"],
    [html("x".repeat(101)), "too_large"],
    [
      {
        status: 200,
        headers: { contentType: "text/html", contentEncoding: "gzip" },
        body: gzipSync(Buffer.alloc(10_000)),
      },
      "too_large",
    ],
    [Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }), "network"],
  ] as const)("reports %# as %s", async (response, code) => {
    const { transport } = fake([response]);
    expect(
      await codeOf(reader(transport, PUBLIC, { maxBytes: 100 }).readPage(`https://${HOST}/`, HOST)),
    ).toBe(code);
  });

  it("times out", async () => {
    const slow: Transport = (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    expect(
      await codeOf(reader(slow, PUBLIC, { timeoutMs: 20 }).readPage(`https://${HOST}/`, HOST)),
    ).toBe("timeout");
  });

  it("caches pages for five minutes", async () => {
    let now = 0;
    const { transport, requested } = fake([html("<p>1</p>"), html("<p>2</p>")]);
    const r = reader(transport, PUBLIC, { now: () => now });
    expect((await r.readPage(`https://${HOST}/`, HOST)).html).toBe("<p>1</p>");
    expect((await r.readPage(`https://${HOST}/`, HOST)).html).toBe("<p>1</p>");
    now = 5 * 60_000 + 1;
    expect((await r.readPage(`https://${HOST}/`, HOST)).html).toBe("<p>2</p>");
    expect(requested).toHaveLength(2);
  });
});

describe("safeLookup", () => {
  it("returns every address when asked for all, and refuses private ones", async () => {
    const lookup = safeLookup(async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);
    const all = await new Promise((resolve) =>
      lookup("x", { all: true }, (_e, addresses) => resolve(addresses)),
    );
    expect(all).toHaveLength(2);

    const blocked = safeLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    const err = await new Promise((resolve) => blocked("x", {}, (e) => resolve(e)));
    expect(err).toMatchObject({ code: "blocked_address" });
  });
});
