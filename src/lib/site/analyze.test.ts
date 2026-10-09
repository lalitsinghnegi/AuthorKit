import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SiteFile } from "@/lib/model";
import { getManifests } from "@/lib/templates/registry";
import { analyzeSite, partsFromManifests } from "./analyze";

const fixture = (name: string) => ({
  url: `https://www.acme.com/${name}.html`,
  html: readFileSync(`src/test/fixtures/site/${name}.html`, "utf8"),
});
const parts = partsFromManifests(getManifests());
const analysis = analyzeSite([fixture("aem-home"), fixture("aem-safety")], parts);
const best = (part: string) => {
  const p = analysis.parts.find((x) => x.part === part)!;
  return p.suggestions[0] ? `${p.suggestions[0].selector} ${p.suggestions[0].confidence}` : null;
};

describe("partsFromManifests", () => {
  it("lists block, element and modifier classes of every component, without the prefix", () => {
    expect(parts.find((p) => p.part === "accordion__trigger")).toEqual({
      componentId: "accordion",
      part: "accordion__trigger",
      kind: "element",
    });
    expect(parts.some((p) => p.componentId === "global" || p.componentId === "tokens")).toBe(false);
    expect(parts.some((p) => p.part === "modal-open")).toBe(false); // utility
  });
});

describe("analyzeSite on AEM Core Components markup", () => {
  it.each([
    ["accordion", ".cmp-accordion high"],
    ["accordion__item", ".cmp-accordion__item high"],
    ["accordion__heading", ".cmp-accordion__header high"],
    ["accordion__trigger", ".cmp-accordion__button high"],
    ["accordion__icon", ".cmp-accordion__icon high"],
    ["accordion__panel", ".cmp-accordion__panel high"],
    ["btn", ".cmp-button high"],
    ["btn--primary", ".cmp-button--primary high"],
    ["btn--secondary", ".cmp-button--secondary high"],
    ["btn__icon", ".cmp-button__icon high"],
    ["header", ".cmp-experiencefragment--header medium"],
    ["header__nav", ".cmp-navigation medium"],
    ["header__list", ".cmp-navigation__group medium"],
    ["header__link", ".cmp-navigation__item-link medium"],
    ["header__logo", ".cmp-image medium"],
    ["footer__inner", ".footer__inner high"],
    ["footer__link", ".footer-link medium"],
    ["isi", ".cmp-isi high"],
    ["isi__content", ".cmp-isi__content high"],
    ["isi-bar", ".cmp-isi-tray high"],
    ["isi-bar__toggle", ".cmp-isi-tray__toggle high"],
    ["modal", ".cmp-modal high"],
    ["modal--interstitial", ".cmp-modal--interstitial high"],
    ["modal__close", ".cmp-modal__close high"],
  ])("suggests %s → %s", (part, expected) => expect(best(part)).toBe(expected));

  it("never suggests state classes for parts, or long names as the block", () => {
    const all = analysis.parts.flatMap((p) => p.suggestions.map((s) => `${p.part} ${s.selector}`));
    expect(all).not.toContain("accordion__trigger .cmp-accordion__button--expanded");
    expect(all).not.toContain("accordion__panel .cmp-accordion__panel--hidden");
    expect(best("footer")).not.toMatch(/footer-link/);
    expect(best("btn--tertiary")).toBeNull();
  });

  it("reports pages, missing parts and the classes found", () => {
    expect(analysis.pages.map((p) => p.title)).toEqual([
      "Acme Health | Home",
      "Acme Health | Safety information",
    ]);
    expect(analysis.notes.join(" ")).toMatch(/parts? ha(s|ve) no match/);
    expect(analysis.classes[0]).toEqual({ name: "cmp-container", count: 4 });
    const trigger = analysis.parts.find((p) => p.part === "accordion__trigger")!.suggestions[0];
    expect(trigger.pages).toEqual([0]);
    expect(trigger.sample).toMatch(/^<button [^>]*class="cmp-accordion__button/);
    expect(trigger.sample).toContain('aria-expanded="true"');
  });

  it("is deterministic and fits the stored schema", () => {
    const again = analyzeSite([fixture("aem-home"), fixture("aem-safety")], parts);
    expect(JSON.stringify(again)).toBe(JSON.stringify(analysis));
    expect(() =>
      SiteFile.parse({
        schemaVersion: 1,
        readAt: new Date(0).toISOString(),
        pages: analysis.pages.map((p) => ({ ...p, ok: true })),
        parts: analysis.parts,
        classes: analysis.classes,
        notes: analysis.notes,
      }),
    ).not.toThrow();
  });

  it("notes pages built by scripts and sites without AEM classes", () => {
    const thin = analyzeSite(
      [{ url: "https://x.test/", html: '<div id="root"></div><script src="/app.js"></script>' }],
      parts,
    );
    expect(thin.notes.join(" ")).toMatch(/built in the browser/);
    expect(thin.notes.join(" ")).toMatch(/No AEM Core Components classes/);
  });

  it("survives hostile markup: deep nesting, odd classes, huge attributes", () => {
    const deep = '<div class="accordion">'.repeat(5000) + "</div>".repeat(5000);
    const odd = `<div class="1bad a{b} ${"x".repeat(300)} cmp-accordion" data-cmp-x="${"y".repeat(5000)}"></div>`;
    const result = analyzeSite([{ url: "https://x.test/", html: deep + odd }], parts);
    const names = result.classes.map((c) => c.name);
    expect(names).toContain("cmp-accordion");
    expect(names.some((n) => n.length > 200 || n.includes("{"))).toBe(false);
    const sample = result.parts.find((p) => p.part === "accordion")!.suggestions[0].sample;
    expect(sample.length).toBeLessThanOrEqual(1200);
  });
});
