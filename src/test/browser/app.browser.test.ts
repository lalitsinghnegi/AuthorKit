// @vitest-environment node
/**
 * Runs the production build (`next start`) against temporary data and checks,
 * in the installed Chrome: security headers, no console or CSP errors, no
 * serious axe violations on any screen, and the viewer's read-only access.
 * Needs a current build, so it runs via `npm run test:app` (APP_BROWSER=1).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProject } from "@/lib/storage/projects";
import { createUser } from "@/lib/storage/users";
import { CHROME, axeViolations } from "./chrome";

const ENABLED = process.env.APP_BROWSER === "1" && Boolean(CHROME) && existsSync(".next/BUILD_ID");
if (process.env.APP_BROWSER === "1" && !ENABLED) {
  console.warn("Skipping app browser tests: needs Chrome and a production build (npm run build).");
}

const ADMIN = { email: "ada@example.com", password: "admin passphrase 1" };
const VIEWER = { email: "vic@example.com", password: "viewer passphrase 1" };

/** The real fetch, limited to the local test server (vitest.setup.ts blocks all others). */
let realFetch: typeof fetch;
const localFetch = (url: string) => {
  if (!url.startsWith("http://localhost:")) throw new Error(`Refusing to fetch ${url}`);
  return realFetch(url);
};

const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });

describe.skipIf(!ENABLED)("AuthorKit in a real browser", () => {
  let dir = "";
  let server: ChildProcess;
  let browser: Browser;
  let base = "";
  let projectId = "";

  beforeAll(async () => {
    vi.unstubAllGlobals();
    realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", () => {
      throw new Error("Network access is disabled in tests.");
    });
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-app-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    await createUser({ ...ADMIN, name: "Ada Admin", role: "admin" });
    await createUser({ ...VIEWER, name: "Vic Viewer", role: "viewer" });
    projectId = (
      await createProject({
        name: "Launch",
        brandName: "Acme Health",
        prefix: "acme",
        approach: "mobile-first",
      })
    ).id;
    process.env.DATA_DIR = previous;

    const port = await freePort();
    base = `http://localhost:${port}`;
    server = spawn(path.resolve("node_modules/.bin/next"), ["start", "-p", String(port)], {
      env: {
        ...process.env,
        DATA_DIR: dir,
        SESSION_SECRET: randomBytes(32).toString("base64"),
        NODE_ENV: "production",
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 120; i++) {
      if ((await localFetch(base + "/api/health").catch(() => null))?.ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    browser = await chromium.launch({ executablePath: CHROME });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.kill();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function signIn(who: {
    email: string;
    password: string;
  }): Promise<{ page: Page; errors: string[] }> {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/login");
    await page.fill("#email", who.email);
    await page.fill("#password", who.password);
    await page.click("button[type=submit]");
    await page.waitForURL("**/projects", { waitUntil: "commit" });
    await page.waitForSelector("text=Sign out");
    return { page, errors };
  }

  it("sends the security headers", async () => {
    const res = await localFetch(base + "/login");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect((await localFetch(`${base}/api/projects/${projectId}/package`)).status).toBe(401);
  });

  it("every screen has no serious accessibility violations and no console or CSP errors", async () => {
    const { page, errors } = await signIn(ADMIN);
    const p = `/projects/${projectId}`;
    const screens = [
      "/projects",
      "/projects/new",
      p,
      `${p}/breakpoints`,
      `${p}/scaffold`,
      `${p}/figma`,
      `${p}/tokens`,
      `${p}/mapping`,
      `${p}/responsive`,
      `${p}/generate`,
      `${p}/styleguide`,
      "/templates",
      "/templates/scaffolds/basic",
      "/settings",
      "/settings/users",
      "/settings/audit",
      "/account",
    ];
    const found: Record<string, unknown> = {};
    for (const screen of screens) {
      await page.goto(base + screen);
      await page.waitForLoadState("networkidle");
      const v = await axeViolations(page);
      if (v.length) found[screen] = v;
    }
    expect(found).toEqual({});
    expect(errors).toEqual([]);
  }, 120_000);

  it("viewers get read-only screens but can download", async () => {
    const { page } = await signIn(VIEWER);
    await page.goto(`${base}/projects/${projectId}/breakpoints`);
    await page.waitForSelector("text=View only.");
    expect(await page.locator("fieldset[disabled] input").count()).toBeGreaterThan(0);
    await page.goto(base + "/settings/users");
    await page.waitForSelector("text=Only admins can open this screen");
    expect((await page.request.get(`${base}/api/projects/${projectId}/package`)).status()).toBe(
      200,
    );
  }, 60_000);
});
