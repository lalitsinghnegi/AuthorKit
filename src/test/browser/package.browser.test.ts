// @vitest-environment node
/**
 * Opens a generated package in a real browser over file://, exactly as a
 * developer would after unzipping it. Uses the locally installed Chrome
 * (or CHROME_PATH); skipped when no Chrome is available, e.g. on bare CI.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackage } from "@/lib/generator/build";
import { inputs, project } from "@/test/figmaProject";

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p): p is string => Boolean(p && existsSync(p)));

if (!CHROME) console.warn("Skipping browser tests: no Chrome found (set CHROME_PATH to run them).");

describe.skipIf(!CHROME)("generated package in a real browser", () => {
  let dir = "";
  let browser: Browser;
  const url = (p: string) => `file://${path.join(dir, "acme-health", p)}`;

  /** Open a page and record every console error, page error and failed request. */
  async function open(p: string, width = 1280): Promise<{ page: Page; errors: string[] }> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
    page.on("requestfailed", (r) => errors.push(`request: ${r.url()}`));
    await page.goto(url(p));
    await page.waitForLoadState("load");
    return { page, errors };
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-browser-"));
    const p = project("mobile-first");
    const pkg = await buildPackage(p, inputs("mobile-first"));
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

  it("sample page loads without errors and applies the brand tokens", async () => {
    const { page, errors } = await open("index.html");
    const bg = await page
      .locator(".acme-btn--primary")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(138, 11, 79)"); // #8a0b4f from Figma
    const h1 = await page
      .locator("h1")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(h1).toBe("40px"); // 2.5rem at desktop width
    expect(errors).toEqual([]);
    await page.close();
  });

  it("header is a drawer on mobile and inline on desktop", async () => {
    const { page, errors } = await open("index.html", 375);
    const toggle = page.locator(".acme-header__toggle");
    const nav = page.locator(".acme-header__nav");
    expect(await toggle.isVisible()).toBe(true);
    expect(await nav.isVisible()).toBe(false);
    await toggle.click();
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    expect(await nav.isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await nav.isVisible()).toBe(false);

    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await toggle.isVisible()).toBe(false);
    expect(await nav.isVisible()).toBe(true);
    expect(
      await page
        .locator("h1")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("40px");
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page
        .locator("h1")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("28px");
    expect(errors).toEqual([]);
    await page.close();
  });

  it("accordion, modal and safety bar work with the documented hooks", async () => {
    const { page, errors } = await open("index.html");
    const trigger = page.locator(".acme-accordion__trigger").nth(1);
    const panel = page.locator(".acme-accordion__panel").nth(1);
    expect(await panel.isVisible()).toBe(false);
    await trigger.click();
    expect(await trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await panel.isVisible()).toBe(true);

    const opener = page.locator("[data-acme-modal-open]");
    await opener.click();
    const dialog = page.locator("dialog.acme-modal");
    expect(await dialog.evaluate((d: HTMLDialogElement) => d.open)).toBe(true);
    expect(await page.locator("body").getAttribute("class")).toContain("acme-modal-open");
    await page.locator("dialog [data-acme-modal-close]").last().click();
    expect(await dialog.evaluate((d: HTMLDialogElement) => d.open)).toBe(false);
    expect(
      await page.evaluate(() => document.activeElement?.hasAttribute("data-acme-modal-open")),
    ).toBe(true);

    const barToggle = page.locator(".acme-isi-bar__toggle");
    await barToggle.click();
    expect(await page.locator(".acme-isi-bar").getAttribute("class")).toContain(
      "acme-isi-bar--expanded",
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  it("style guide opens offline without errors, and inspect mode reports classes", async () => {
    const { page, errors } = await open("style-guide/index.html");
    // Scroll through so every lazy example frame loads.
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    expect(await page.locator("#sg-cta").isVisible()).toBe(true);

    await page.locator(".sg-inspect-toggle").click();
    await page.locator("#sg-cta").scrollIntoViewIfNeeded();
    await page
      .frameLocator("#sg-cta .sg-example iframe")
      .first()
      .locator(".acme-btn--primary")
      .click();
    const inspector = page.locator(".sg-inspector");
    expect(await inspector.isVisible()).toBe(true);
    expect(await inspector.textContent()).toContain(".acme-btn--primary");

    await page.locator("#sg-search").fill("accordion");
    expect(await page.locator("#sg-cta").isVisible()).toBe(false);
    expect(await page.locator("#sg-accordion").isVisible()).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});
