/**
 * A package that uses the site's own classes (from the AEM fixtures), opened
 * from file:// like the main package test: the sample page's hooks must work
 * with the renamed classes, and nothing may fail to load or throw.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackage } from "@/lib/generator/build";
import { inputs } from "@/test/figmaProject";
import { mappedProject } from "@/test/siteSelectorsProject";
import { CHROME, axeViolations } from "./chrome";

describe.skipIf(!CHROME)("package with site selectors in a real browser", () => {
  let dir = "";
  let browser: Browser;

  async function open(p: string): Promise<{ page: Page; errors: string[] }> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
    page.on("requestfailed", (r) => errors.push(`request: ${r.url()}`));
    await page.goto(`file://${path.join(dir, "acme-health", p)}`);
    await page.waitForLoadState("load");
    return { page, errors };
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-site-"));
    const pkg = await buildPackage(mappedProject(), inputs("mobile-first"));
    expect(pkg.blocked).toBe(false);
    for (const f of pkg.files) {
      const target = path.join(dir, pkg.rootName, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content);
    }
    browser = await chromium.launch({ executablePath: CHROME });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("styles and wires the site classes on the sample page", async () => {
    const { page, errors } = await open("index.html");
    expect(await page.locator(".acme-btn--primary, .acme-accordion__trigger").count()).toBe(0);
    const bg = await page
      .locator(".cmp-button--primary")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(138, 11, 79)");

    const trigger = page.locator(".cmp-accordion__button").nth(1);
    const panel = page.locator(".cmp-accordion__panel").nth(1);
    expect(await panel.isVisible()).toBe(false);
    await trigger.click();
    expect(await trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await panel.isVisible()).toBe(true);

    const toggle = page.locator(".cmp-isi-tray__toggle");
    await toggle.click();
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("style guide loads, shows scoped selectors and has no serious violations", async () => {
    const { page, errors } = await open("style-guide/index.html");
    expect(
      await page.locator("text=.cmp-experiencefragment--header .cmp-image").count(),
    ).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    // After the error check: axe fetches stylesheets with XHR, which file:// refuses.
    expect(await axeViolations(page)).toEqual([]);
    await page.close();
  }, 60_000);
});
