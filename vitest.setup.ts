import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { jar } from "@/test/session";

afterEach(() => {
  cleanup();
  jar.cookies.clear();
  jar.headers = new Headers();
  // Package build limits and cache live on globalThis (src/lib/generator/limit.ts).
  const limits = (
    globalThis as { __akBuildLimit?: { cache: Map<string, unknown>; perUser: Map<string, number> } }
  ).__akBuildLimit;
  limits?.cache.clear();
  limits?.perUser.clear();
  (globalThis as { __akBudgets?: Map<string, unknown> }).__akBudgets?.clear();
  (globalThis as { __akSiteCache?: Map<string, unknown> }).__akSiteCache?.clear();
});

// `server-only` throws outside the React Server bundle; tests import server modules directly.
vi.mock("server-only", () => ({}));

// A fixed signing secret for session cookies in tests.
process.env.SESSION_SECRET ??= "test-session-secret-that-is-long-enough-0123456789";

// Cookies and headers come from an in-memory jar; see src/test/session.ts.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.cookies.has(name) ? { name, value: jar.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => void jar.cookies.set(name, value),
    delete: (name: string) => void jar.cookies.delete(name),
  }),
  headers: async () => jar.headers,
}));

// Outside a request, `connection()` has nothing to wait for.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// Tests must never reach the network (and especially never the real Figma API).
// Tests that exercise HTTP code inject their own fetch implementation.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is disabled in tests. Inject a fetch implementation instead.");
});
