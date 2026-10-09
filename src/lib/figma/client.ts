import "server-only";
import { createHash } from "node:crypto";
import { logWarn } from "@/lib/log";
import type { Secret } from "@/lib/secrets/secret";
import { FigmaError } from "./errors";
import type {
  FigmaFile,
  FigmaImagesResponse,
  FigmaMe,
  FigmaNodesResponse,
  FigmaStylesResponse,
  FigmaVariablesResponse,
} from "./types";

/** Everything AuthorKit asks Figma for. The HTTP client and the test mock both implement it. */
export interface FigmaClient {
  getMe(): Promise<FigmaMe>;
  getFile(fileKey: string, options?: { depth?: number }): Promise<FigmaFile>;
  getNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse>;
  getStyles(fileKey: string): Promise<FigmaStylesResponse>;
  getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse>;
  getImages(
    fileKey: string,
    nodeIds: string[],
    options?: { format?: "png" | "svg" | "jpg"; scale?: number },
  ): Promise<FigmaImagesResponse>;
}

/** The only host requests may go to. Never built from user input. */
export const FIGMA_API = "https://api.figma.com";

const FILE_KEY = /^[A-Za-z0-9]{10,64}$/;
const NODE_ID = /^I?\d+:\d+(;\d+:\d+)*$/;

function checkKey(fileKey: string) {
  if (!FILE_KEY.test(fileKey)) throw new FigmaError("bad_request");
}
function checkNodes(ids: string[]) {
  if (ids.length === 0 || ids.length > 100 || !ids.every((id) => NODE_ID.test(id))) {
    throw new FigmaError("bad_request");
  }
}

type CacheEntry = { expires: number; value: unknown };

export type HttpClientOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Shared across client instances; keys include a hash of the token. */
  cache?: Map<string, CacheEntry>;
  cacheTtlMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
};

const sharedCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

export class HttpFigmaClient implements FigmaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly cache: Map<string, CacheEntry>;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly tokenId: string;

  constructor(
    private readonly token: Secret,
    options: HttpClientOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
    this.cache = options.cache ?? sharedCache;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    // Cache entries are per token, without keeping the token itself as a key.
    this.tokenId = createHash("sha256").update(token.reveal()).digest("hex").slice(0, 16);
  }

  async getMe() {
    return this.get<FigmaMe>("/v1/me", { cache: false });
  }

  async getFile(fileKey: string, options: { depth?: number } = {}) {
    checkKey(fileKey);
    const q = options.depth ? `?depth=${Math.max(1, Math.min(10, Math.floor(options.depth)))}` : "";
    return this.get<FigmaFile>(`/v1/files/${fileKey}${q}`);
  }

  async getNodes(fileKey: string, nodeIds: string[]) {
    checkKey(fileKey);
    checkNodes(nodeIds);
    return this.get<FigmaNodesResponse>(
      `/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeIds.join(","))}`,
    );
  }

  async getStyles(fileKey: string) {
    checkKey(fileKey);
    return this.get<FigmaStylesResponse>(`/v1/files/${fileKey}/styles`);
  }

  async getLocalVariables(fileKey: string) {
    checkKey(fileKey);
    return this.get<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`, {
      variables: true,
    });
  }

  async getImages(
    fileKey: string,
    nodeIds: string[],
    options: { format?: "png" | "svg" | "jpg"; scale?: number } = {},
  ) {
    checkKey(fileKey);
    checkNodes(nodeIds);
    const format = options.format ?? "png";
    const scale = Math.max(0.01, Math.min(4, options.scale ?? 1));
    // Render URLs expire, so image responses are never cached.
    return this.get<FigmaImagesResponse>(
      `/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds.join(","))}&format=${format}&scale=${scale}`,
      { cache: false },
    );
  }

  private async get<T>(
    path: string,
    opts: { cache?: boolean; variables?: boolean } = {},
  ): Promise<T> {
    const useCache = opts.cache !== false;
    const cacheKey = `${this.tokenId} ${path}`;
    if (useCache) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expires > this.now()) return hit.value as T;
    }

    const url = new URL(path, FIGMA_API);
    if (url.origin !== FIGMA_API) throw new FigmaError("bad_request");

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { "X-Figma-Token": this.token.reveal() },
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: "error",
        });
      } catch {
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw new FigmaError("network");
      }

      if (res.ok) {
        const value = (await res.json()) as T;
        if (useCache) this.remember(cacheKey, value);
        return value;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(
          res.status === 429 ? this.retryAfter(res, attempt) : this.backoff(attempt),
        );
        continue;
      }
      throw await this.toError(res, url.pathname, opts.variables === true);
    }
  }

  private backoff(attempt: number) {
    return 500 * 2 ** attempt;
  }

  private retryAfter(res: Response, attempt: number) {
    const seconds = Number(res.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds, 60) * 1000
      : this.backoff(attempt);
  }

  private remember(key: string, value: unknown) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { expires: this.now() + this.cacheTtlMs, value });
  }

  private async toError(res: Response, path: string, variables: boolean): Promise<FigmaError> {
    let detail = "";
    try {
      const body = (await res.json()) as { err?: string; message?: string };
      detail = `${body.err ?? ""} ${body.message ?? ""}`.trim();
    } catch {
      // Body is not JSON; the status code is enough.
    }
    // Figma's own reason, for the server log only (the user sees fixed text).
    logWarn("figma_error", { status: res.status, path, reason: detail.slice(0, 200) });
    const reason = detail.toLowerCase();
    if (res.status === 401) return new FigmaError("invalid_token", 401);
    if (res.status === 403) {
      if (reason.includes("invalid token") || reason.includes("token expired"))
        return new FigmaError("invalid_token", 403);
      // Variables need an Enterprise plan (and scope); callers fall back to styles.
      if (variables) return new FigmaError("plan_limit", 403);
      if (reason.includes("scope")) return new FigmaError("missing_scope", 403);
      // /me involves no file, so a refusal there is about the token itself.
      if (path === "/v1/me") return new FigmaError("invalid_token", 403);
      return new FigmaError("no_access", 403);
    }
    if (res.status === 404) return new FigmaError("not_found", 404);
    if (res.status === 429) return new FigmaError("rate_limited", 429);
    if (res.status >= 500) return new FigmaError("server", res.status);
    return new FigmaError("bad_request", res.status);
  }
}
