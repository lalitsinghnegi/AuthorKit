import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAudit } from "@/lib/audit/log";
import { SiteReader, type RawResponse } from "@/lib/site/fetch";
import { createProject, getProject, getSite, updateProject } from "@/lib/storage/projects";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

/** Pages the fake site serves, by path; anything else is a 404. */
let served: Record<string, string>;
let requested: string[];
vi.mock("@/lib/site/server", () => ({
  getSiteReader: () =>
    new SiteReader({
      cache: new Map(),
      resolve: async () => [{ address: "93.184.215.14", family: 4 }],
      transport: async (url): Promise<RawResponse> => {
        requested.push(url.href);
        const body = served[url.pathname];
        return body === undefined
          ? { status: 404, headers: { contentType: "text/html" }, body: Buffer.from("nope") }
          : { status: 200, headers: { contentType: "text/html" }, body: Buffer.from(body) };
      },
    }),
}));

const { readSiteAction, saveSitePagesAction, saveSiteSelectorsAction } = await import("./actions");

withTempDataDir();
withSignedIn("admin");

const fixture = (name: string) => readFileSync(`src/test/fixtures/site/${name}.html`, "utf8");

beforeEach(() => {
  served = { "/en.html": fixture("aem-home"), "/en/safety.html": fixture("aem-safety") };
  requested = [];
});

const newProject = (siteUrl?: string) =>
  createProject({
    name: "P",
    brandName: "Acme",
    prefix: "acme",
    approach: "mobile-first",
    siteUrl,
  });

describe("readSiteAction", () => {
  it("needs a site URL", async () => {
    const { id } = await newProject();
    expect(await readSiteAction(id)).toEqual({
      ok: false,
      error: "Add the site URL on the project overview first.",
    });
    expect(requested).toEqual([]);
  });

  it("reads the site and extra pages, reports failures, saves and audits", async () => {
    const { id } = await newProject("https://www.acme.com/en.html");
    await updateProject(id, (p) => ({ ...p, sitePages: ["/en/safety.html", "/en/missing.html"] }));

    const result = await readSiteAction(id);
    expect(result.ok).toBe(true);
    const data = (await getSite(id))!;
    expect(data.pages.map((p) => [p.url, p.ok, p.error ?? p.title])).toEqual([
      ["https://www.acme.com/en.html", true, "Acme Health | Home"],
      ["https://www.acme.com/en/safety.html", true, "Acme Health | Safety information"],
      [
        "https://www.acme.com/en/missing.html",
        false,
        "The site answered with an error. (HTTP 404)",
      ],
    ]);
    const modal = data.parts.find((p) => p.part === "modal")!.suggestions[0];
    expect(modal).toMatchObject({ selector: ".cmp-modal", pages: [1] });
    expect((await readAudit()).entries[0]).toMatchObject({
      action: "site.read",
      details: "2/3 pages, 40/46 parts matched",
    });
  });

  it("fails clearly when no page can be read", async () => {
    const { id } = await newProject("https://www.acme.com/gone.html");
    expect(await readSiteAction(id)).toEqual({
      ok: false,
      error: "The site answered with an error. (HTTP 404)",
    });
    expect(await getSite(id)).toBeNull();
  });

  it("is limited per user", async () => {
    const { SITE_BUDGET, spend } = await import("@/lib/security/rateLimit");
    const { getCurrentUser } = await import("@/lib/auth/session");
    const me = (await getCurrentUser())!;
    for (let i = 0; i < SITE_BUDGET.max; i++) spend(SITE_BUDGET, me.id);
    expect(await readSiteAction("any")).toEqual({ ok: false, error: SITE_BUDGET.message });
  });
});

describe("saveSitePagesAction", () => {
  it("saves paths, drops duplicates and blanks, and clears with an empty list", async () => {
    const { id } = await newProject("https://www.acme.com/en.html");
    expect(await saveSitePagesAction(id, " /en/faq.html \n\n/en/faq.html\r\n/en/isi.html")).toEqual(
      {
        ok: true,
        pages: ["/en/faq.html", "/en/isi.html"],
      },
    );
    expect((await getProject(id))?.sitePages).toEqual(["/en/faq.html", "/en/isi.html"]);
    expect(await saveSitePagesAction(id, "")).toEqual({ ok: true, pages: [] });
    expect((await getProject(id))?.sitePages).toBeUndefined();
  });

  it.each(["https://evil.example/x", "//evil.example/x", "en/faq.html", "/a b", "/a\\b"])(
    "refuses %j",
    async (path) => {
      const { id } = await newProject("https://www.acme.com/");
      const result = await saveSitePagesAction(id, path);
      expect(result.ok).toBe(false);
      expect((await getProject(id))?.sitePages).toBeUndefined();
    },
  );

  it("refuses more than the maximum", async () => {
    const { id } = await newProject("https://www.acme.com/");
    const many = Array.from({ length: 21 }, (_, i) => `/p${i}.html`).join("\n");
    expect(await saveSitePagesAction(id, many)).toEqual({
      ok: false,
      error: "Add at most 20 pages.",
    });
  });
});

describe("saveSiteSelectorsAction", () => {
  const trigger = {
    componentId: "accordion",
    part: "accordion__trigger",
    state: "confirmed",
    selector: ".cmp-accordion__button",
    scoped: false,
  } as const;

  it("saves valid mappings and audits them", async () => {
    const { id } = await newProject("https://www.acme.com/");
    const input = { enabled: true, mappings: [trigger] };
    expect(await saveSiteSelectorsAction(id, input)).toEqual({ ok: true });
    expect((await getProject(id))?.siteSelectors).toEqual(input);
    expect((await readAudit()).entries[0]).toMatchObject({
      action: "site.selectors",
      details: "1 confirmed, 0 kept, site selectors on",
    });
  });

  it("returns problems per part and saves nothing", async () => {
    const { id } = await newProject("https://www.acme.com/");
    const result = await saveSiteSelectorsAction(id, {
      enabled: false,
      mappings: [{ ...trigger, scoped: true }],
    });
    expect(result).toMatchObject({
      ok: false,
      problems: [
        { part: "accordion__trigger", message: expect.stringMatching(/Confirm a site class/) },
      ],
    });
    expect((await getProject(id))?.siteSelectors).toBeUndefined();
  });

  it.each([
    { enabled: true, mappings: [{ ...trigger, selector: ".a b" }] },
    { enabled: true, mappings: [{ ...trigger, selector: "*" }] },
    { enabled: true, mappings: [{ ...trigger, selector: undefined }] },
    { enabled: "yes", mappings: [] },
    "nonsense",
  ])("refuses malformed input %#", async (input) => {
    const { id } = await newProject("https://www.acme.com/");
    expect((await saveSiteSelectorsAction(id, input)).ok).toBe(false);
  });
});
