import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";
import { isPublicAddress } from "./address";

export type SiteErrorCode =
  | "bad_url"
  | "bad_port"
  | "blocked_address"
  | "wrong_host"
  | "too_many_redirects"
  | "timeout"
  | "network"
  | "http_status"
  | "not_html"
  | "too_large";

const MESSAGES: Record<SiteErrorCode, string> = {
  bad_url: "Only http:// and https:// pages can be read.",
  bad_port: "Only sites on the standard web ports (80 and 443) can be read.",
  blocked_address:
    "That site resolves to a private or internal address, which AuthorKit does not read. Use a public URL.",
  wrong_host:
    "AuthorKit only reads pages on the project's site, and does not follow redirects to other sites.",
  too_many_redirects: "The page redirected too many times.",
  timeout: "The site took too long to respond.",
  network: "Cannot reach the site. Check the URL and that the site is public.",
  http_status: "The site answered with an error.",
  not_html: "That address is not an HTML page.",
  too_large: "The page is larger than 5 MB.",
};

/** Errors reading a site page. Messages are fixed text, safe to show and log. */
export class SiteError extends Error {
  constructor(
    readonly code: SiteErrorCode,
    readonly status?: number,
  ) {
    super(status ? `${MESSAGES[code]} (HTTP ${status})` : MESSAGES[code]);
    this.name = "SiteError";
  }
}

export type ResolvedAddress = { address: string; family: number };
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;
export type RawResponse = {
  status: number;
  headers: { contentType?: string; contentEncoding?: string; location?: string };
  body: Buffer;
};
/** Performs one request, connecting only to addresses that `lookup` returns. */
export type Transport = (
  url: URL,
  options: { lookup: LookupFunction; signal: AbortSignal; maxBytes: number },
) => Promise<RawResponse>;

export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;
const CACHE_MS = 5 * 60_000;
const CACHE_ENTRIES = 50;

export type SitePage = { url: string; html: string };

type CacheEntry = { expires: number; page: SitePage };
const sharedCache: Map<string, CacheEntry> = ((
  globalThis as { __akSiteCache?: Map<string, CacheEntry> }
).__akSiteCache ??= new Map());

const defaultResolve: Resolve = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/**
 * A DNS lookup for the HTTP client that refuses the connection unless every
 * address the name resolves to is public. Because the client connects to the
 * address returned here, a name cannot pass this check and then be pointed at
 * an internal address (DNS rebinding).
 */
export function safeLookup(resolve: Resolve): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
          callback(new SiteError("blocked_address"), "", 0);
          return;
        }
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      () => callback(new SiteError("network"), "", 0),
    );
  };
}

/** The real transport: node:http(s), no proxy, no connection reuse, size-capped. */
const nodeTransport: Transport = (url, { lookup, signal, maxBytes }) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup,
        signal,
        headers: {
          "User-Agent": "AuthorKit site reader",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) req.destroy(new SiteError("too_large"));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              contentType: res.headers["content-type"],
              contentEncoding: res.headers["content-encoding"],
              location: res.headers.location,
            },
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Decompress within the size cap, so a small compressed response cannot expand without limit. */
function decode(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const enc = (encoding ?? "").trim().toLowerCase();
  try {
    if (enc === "gzip" || enc === "x-gzip")
      return zlib.gunzipSync(body, { maxOutputLength: maxBytes });
    if (enc === "deflate") return zlib.inflateSync(body, { maxOutputLength: maxBytes });
    if (enc === "br") return zlib.brotliDecompressSync(body, { maxOutputLength: maxBytes });
  } catch (err) {
    if (err instanceof RangeError || (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE")
      throw new SiteError("too_large");
    throw new SiteError("network");
  }
  return body;
}

function charsetOf(contentType: string): string {
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  const label = match?.[1].toLowerCase() ?? "utf-8";
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return "utf-8";
  }
}

export type SiteReaderOptions = {
  resolve?: Resolve;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  cache?: Map<string, CacheEntry>;
  now?: () => number;
};

/**
 * Reads HTML pages from one public site. Every URL, including each redirect,
 * must be on `allowedHost`, use http(s) on the default port, and resolve only
 * to public addresses. Responses are capped in time and size and cached for
 * five minutes. Nothing is executed: the caller parses the HTML as text.
 */
export class SiteReader {
  private readonly resolve: Resolve;
  private readonly transport: Transport;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly cache: Map<string, CacheEntry>;
  private readonly now: () => number;

  constructor(options: SiteReaderOptions = {}) {
    this.resolve = options.resolve ?? defaultResolve;
    this.transport = options.transport ?? nodeTransport;
    this.timeoutMs = options.timeoutMs ?? PAGE_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? MAX_PAGE_BYTES;
    this.cache = options.cache ?? sharedCache;
    this.now = options.now ?? Date.now;
  }

  /** Throws SiteError unless `raw` is a URL this reader may request. */
  check(raw: string | URL, allowedHost: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new SiteError("bad_url");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new SiteError("bad_url");
    if (url.username || url.password) throw new SiteError("bad_url");
    if (url.port !== "") throw new SiteError("bad_port");
    if (url.hostname !== allowedHost.toLowerCase()) throw new SiteError("wrong_host");
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !isPublicAddress(literal)) throw new SiteError("blocked_address");
    url.hash = "";
    return url;
  }

  async readPage(raw: string, allowedHost: string): Promise<SitePage> {
    let url = this.check(raw, allowedHost);
    const key = url.href;
    const hit = this.cache.get(key);
    if (hit && hit.expires > this.now()) return hit.page;

    const signal = AbortSignal.timeout(this.timeoutMs);
    const lookup = safeLookup(this.resolve);
    for (let redirects = 0; ; redirects++) {
      let res: RawResponse;
      try {
        res = await this.transport(url, { lookup, signal, maxBytes: this.maxBytes });
      } catch (err) {
        if (err instanceof SiteError) throw err;
        const cause = (err as { cause?: unknown }).cause;
        if (cause instanceof SiteError) throw cause;
        if (signal.aborted) throw new SiteError("timeout");
        throw new SiteError("network");
      }

      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (redirects >= MAX_REDIRECTS) throw new SiteError("too_many_redirects");
        let next: URL;
        try {
          next = new URL(res.headers.location, url);
        } catch {
          throw new SiteError("bad_url");
        }
        url = this.check(next, allowedHost);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new SiteError("http_status", res.status);

      const type = res.headers.contentType ?? "";
      if (!/^\s*(text\/html|application\/xhtml\+xml)\b/i.test(type))
        throw new SiteError("not_html");
      if (res.body.length > this.maxBytes) throw new SiteError("too_large");
      const body = decode(res.body, res.headers.contentEncoding, this.maxBytes);
      const html = new TextDecoder(charsetOf(type)).decode(body);

      const page = { url: url.href, html };
      if (this.cache.size >= CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: this.now() + CACHE_MS, page });
      return page;
    }
  }
}
