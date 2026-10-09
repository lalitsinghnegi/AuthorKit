import { describe, expect, it } from "vitest";
import type { SelectorMapping } from "@/lib/model";
import { getManifests } from "@/lib/templates/registry";
import {
  blockOf,
  classMapFor,
  mapCss,
  mapManifests,
  mapText,
  mappableParts,
  mappedClasses,
  validateMappings,
} from "./map";

const parts = mappableParts(getManifests());
const confirm = (part: string, selector: string, scoped = false): SelectorMapping => ({
  componentId: parts.find((p) => p.part === part)!.componentId,
  part,
  selector,
  scoped,
  state: "confirmed",
});
const project = (mappings: SelectorMapping[], enabled = true) => ({
  prefix: "ak",
  siteSelectors: { enabled, mappings },
});

describe("blockOf and mappableParts", () => {
  it("finds the block of elements and variants", () => {
    expect(blockOf("isi-bar__toggle")).toBe("isi-bar");
    expect(blockOf("btn--primary")).toBe("btn");
    expect(blockOf("accordion")).toBe("accordion");
  });
  it("lists block, element and modifier parts only", () => {
    expect(parts).toContainEqual({ componentId: "cta", part: "btn--primary", kind: "modifier" });
    expect(parts.some((p) => p.part === "modal-open" || p.componentId === "global")).toBe(false);
  });
});

describe("validateMappings", () => {
  it("accepts a sensible set, including one class scoped to two different blocks", () => {
    const ok = [
      confirm("header", ".cmp-experiencefragment--header"),
      confirm("footer", ".cmp-experiencefragment--footer"),
      confirm("header__logo", ".cmp-image", true),
      confirm("footer__logo", ".cmp-image", true),
      { componentId: "cta", part: "btn--block", scoped: false, state: "ignored" } as const,
    ];
    expect(validateMappings(ok, parts, "ak")).toEqual([]);
  });

  it.each([
    [
      [confirm("header__logo", ".cmp-image"), confirm("footer__logo", ".cmp-image")],
      /also used for/,
    ],
    [[confirm("header__logo", ".cmp-image", true)], /Confirm a site class for \.ak-header first/],
    [[confirm("btn--primary", ".cmp-button--primary", true)], /Only elements can be limited/],
    [[confirm("accordion", ".cmp-accordion"), confirm("accordion", ".x")], /mapped more than once/],
    [[confirm("btn", ".ak-accordion")], /is a template class/],
    [
      [{ ...confirm("btn", ".cmp-button"), componentId: "accordion" as const }],
      /not a part of accordion/,
    ],
  ])("reports problem %#", (mappings, message) => {
    const problems = validateMappings(mappings, parts, "ak");
    expect(problems.map((p) => p.message).join(" ")).toMatch(message);
  });
});

describe("classMapFor", () => {
  it("is null when off or nothing is confirmed, and keeps scopes", () => {
    expect(classMapFor(project([confirm("btn", ".cmp-button")], false))).toBeNull();
    expect(classMapFor({ prefix: "ak" })).toBeNull();
    const map = classMapFor(
      project([
        confirm("header", ".cmp-xf--header"),
        confirm("header__logo", ".cmp-image", true),
        { componentId: "cta", part: "btn", scoped: false, state: "ignored" },
      ]),
    )!;
    expect([...map.targets]).toEqual([
      ["header", { cls: "cmp-xf--header" }],
      ["header__logo", { cls: "cmp-image", scope: "cmp-xf--header" }],
    ]);
    expect(mappedClasses(map)).toEqual(["cmp-image", "cmp-xf--header"]);
  });
});

describe("mapCss", () => {
  const map = classMapFor(
    project([
      confirm("header", ".cmp-xf--header"),
      confirm("header__logo", ".cmp-image", true),
      confirm("accordion__trigger", ".cmp-accordion__button"),
      confirm("accordion__icon", ".cmp-accordion__icon"),
    ]),
  )!;

  it("renames classes and scopes elements that need it", () => {
    const css = [
      ".ak-header__logo:hover { color: red; }",
      ".ak-header .ak-header__logo { margin: 0; }",
      '.ak-accordion__trigger[aria-expanded="true"] .ak-accordion__icon { transform: none; }',
      ".ak-btn, .ak-header__logo img { display: block; }",
      "@media (min-width: 768px) { .ak-header__logo { width: 1px; } }",
    ].join("\n");
    expect(mapCss(css, map)).toBe(
      [
        ".cmp-xf--header .cmp-image:hover { color: red; }",
        ".cmp-xf--header .cmp-image { margin: 0; }",
        '.cmp-accordion__button[aria-expanded="true"] .cmp-accordion__icon { transform: none; }',
        ".ak-btn, .cmp-xf--header .cmp-image img { display: block; }",
        "@media (min-width: 768px) { .cmp-xf--header .cmp-image { width: 1px; } }",
      ].join("\n"),
    );
  });

  it("leaves custom properties, keyframes and unmapped classes alone", () => {
    const css =
      ".ak-btn { --ak-header__logo-size: 1px; width: var(--ak-header__logo-size); }\n@keyframes ak-header__logo { from { opacity: 0; } }";
    expect(mapCss(css, map)).toBe(css);
  });
});

describe("mapText and mapManifests", () => {
  const map = classMapFor(
    project([
      confirm("btn", ".cmp-button"),
      confirm("btn--primary", ".cmp-button--primary"),
      confirm("header", ".cmp-xf--header"),
      confirm("header__logo", ".cmp-image", true),
    ]),
  )!;

  it("replaces whole class names only", () => {
    expect(
      mapText('<a class="ak-btn ak-btn--primary ak-btn--secondary" style="--ak-btn-x: 1">', map),
    ).toBe('<a class="cmp-button cmp-button--primary ak-btn--secondary" style="--ak-btn-x: 1">');
    expect(mapText('q(".{{prefix}}-btn")', map, "{{prefix}}")).toBe('q(".cmp-button")');
  });

  it("maps selectors, examples and states, and records scopes", () => {
    const manifests = mapManifests(getManifests(), map);
    const cta = manifests.cta;
    expect(cta.selectors.map((s) => s.selector)).toContain(".cmp-button--primary");
    expect(cta.examples[0].html).toContain("cmp-button");
    expect(cta.examples[0].html).not.toMatch(/\{\{prefix\}\}-btn(?![_-])/);
    const logo = manifests.header.selectors.find((s) => s.selector === ".cmp-image")!;
    expect(logo).toMatchObject({ scope: ".cmp-xf--header" });
    expect(getManifests().cta.selectors[0].selector).toBe(".{{prefix}}-btn"); // originals untouched
    expect(mapManifests(getManifests(), null)).toBe(getManifests());
  });
});
