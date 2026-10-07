import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import { CSS_TEMPLATE_IDS, type Breakpoint, type CssTemplateId } from "@/lib/model";
import { BREAKPOINT_PRESETS } from "@/lib/breakpoints";
import { analyzeCss, literalDesignValues } from "./analyze";
import { cascade } from "./cascade";
import { contrastRatio } from "./contrast";
import { buildTemplateContext, commentSafe, type TemplateContext } from "./context";
import { TEMPLATE_DEFAULTS } from "./defaults";
import { ComponentManifest, manifestClasses, withPrefix } from "./manifest";
import { getManifests, rawManifests } from "./registry";
import { renderTemplate } from "./render";
import { outputStylelintConfig } from "./stylelintConfig";

const preset = (id: string): Breakpoint[] =>
  BREAKPOINT_PRESETS.find((p) => p.id === id)!.breakpoints.map((b) => ({ ...b, id: b.name }));
const threeStep = preset("three-step");

const ctxFor = (
  approach: "mobile-first" | "desktop-first",
  prefix = "ak",
  breakpoints = threeStep,
) => buildTemplateContext({ brandName: "Acme Health", prefix, approach, breakpoints });

const renderAll = (ctx: TemplateContext) =>
  Object.fromEntries(CSS_TEMPLATE_IDS.map((id) => [id, renderTemplate(id, ctx)])) as Record<
    CssTemplateId,
    string
  >;

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const unprefixed = (names: Set<string>) => [...names].map((n) => n.replace(/^ak-/, ""));

describe("cascade", () => {
  const bps = threeStep;
  const values = (id: string) =>
    ({ mobile: { a: "1", b: "x" }, tablet: { a: "2", b: "x" }, desktop: { a: "2", b: "y" } })[id]!;

  it("mobile-first: base is the smallest, each step only adds what changed since the previous step", () => {
    const { base, steps } = cascade(bps, "mobile-first", values);
    expect(base).toEqual({ a: "1", b: "x" });
    expect(steps.map((s) => [s.name, s.condition, s.changed])).toEqual([
      ["mobile", null, { a: "1", b: "x" }],
      ["tablet", "(min-width: 768px)", { a: "2" }],
      ["desktop", "(min-width: 1024px)", { b: "y" }],
    ]);
  });

  it("desktop-first: base is the largest, steps go downwards", () => {
    const { base, steps } = cascade(bps, "desktop-first", values);
    expect(base).toEqual({ a: "2", b: "y" });
    expect(steps.map((s) => [s.name, s.condition, s.changed])).toEqual([
      ["desktop", null, { a: "2", b: "y" }],
      ["tablet", "(max-width: 1023px)", { b: "x" }],
      ["mobile", "(max-width: 767px)", { a: "1" }],
    ]);
  });
});

describe("manifests", () => {
  it.each(CSS_TEMPLATE_IDS)("%s matches the schema and its id", (id) => {
    const result = ComponentManifest.safeParse(rawManifests()[id]);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(result.data!.id).toBe(id);
    expect(result.data!.fileName).toBe(`${id}.css`);
  });

  it("rejects selectors without the prefix placeholder", () => {
    const broken = structuredClone(getManifests().cta);
    broken.selectors[0] = { type: "block", selector: ".btn", purpose: "x" };
    expect(ComponentManifest.safeParse(broken).success).toBe(false);
  });

  it("examples only use classes documented in some manifest", () => {
    const known = new Set(Object.values(getManifests()).flatMap((m) => manifestClasses(m, "ak")));
    for (const manifest of Object.values(getManifests())) {
      for (const example of manifest.examples) {
        const html = withPrefix(example.html, "ak");
        const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
        for (const c of classes)
          expect(known, `${manifest.id}: "${c}" in "${example.title}"`).toContain(c);
      }
    }
  });
});

describe.each(["mobile-first", "desktop-first"] as const)("rendered templates (%s)", (approach) => {
  const ctx = ctxFor(approach);
  const output = renderAll(ctx);

  it.each(CSS_TEMPLATE_IDS)("%s passes stylelint", async (id) => {
    const result = await stylelint.lint({ code: output[id], config: outputStylelintConfig("ak") });
    const warnings = result.results[0].warnings.map((w) => `${w.line}:${w.column} ${w.text}`);
    expect(warnings).toEqual([]);
  });

  it.each(CSS_TEMPLATE_IDS)("%s uses variables for every design value", (id) => {
    expect(literalDesignValues(output[id])).toEqual([]);
  });

  it.each(CSS_TEMPLATE_IDS)("%s header lists exactly the variables it uses", (id) => {
    const header = output[id].match(/^\/\*![\s\S]*?\*\//)![0];
    const listed = [...header.matchAll(/--ak-([a-z0-9-]+)/g)].map((m) => m[1]).sort();
    const facts = analyzeCss(stripComments(output[id]));
    const expected = unprefixed(id === "tokens" ? facts.declaredVariables : facts.usedVariables);
    expect(listed).toEqual(expected.sort());
    expect(header).toContain("Acme Health · " + getManifests()[id].fileName);
  });

  it.each(CSS_TEMPLATE_IDS.filter((id) => id !== "tokens"))(
    "%s manifest lists exactly the variables it uses",
    (id) => {
      expect(unprefixed(analyzeCss(output[id]).usedVariables).sort()).toEqual(
        [...getManifests()[id].variables].sort(),
      );
    },
  );

  it("every variable used anywhere is defined somewhere in the package", () => {
    const all = Object.values(output).map((css) => analyzeCss(css));
    const declared = new Set(all.flatMap((f) => [...f.declaredVariables]));
    const missing = all.flatMap((f) => [...f.usedVariables]).filter((v) => !declared.has(v));
    expect(missing).toEqual([]);
  });

  it.each(CSS_TEMPLATE_IDS)("%s classes match its manifest exactly", (id) => {
    const inCss = [...analyzeCss(output[id]).classes].sort();
    expect(inCss).toEqual(manifestClasses(getManifests()[id], "ak").sort());
  });

  it.each(CSS_TEMPLATE_IDS)("%s respects reduced motion if it animates", (id) => {
    const facts = analyzeCss(output[id]);
    if (facts.hasTransitionOrAnimation) expect(facts.hasReducedMotionQuery).toBe(true);
  });

  it.each(["global", "header", "footer", "isi", "modals", "cta", "accordion"] as const)(
    "%s has focus-visible styles",
    (id) => {
      expect(analyzeCss(output[id]).hasFocusVisible).toBe(true);
    },
  );

  it("renders identically twice (deterministic)", () => {
    expect(renderAll(ctxFor(approach))).toEqual(output);
  });
});

describe("responsive hooks", () => {
  it("mobile-first: large-screen values go into a min-width query; tablet hook is a marker only", () => {
    const css = renderTemplate("tokens", ctxFor("mobile-first"));
    expect(css).toContain("--ak-font-size-h1: 2rem;");
    expect(css).toContain(
      "/* @authorkit-responsive tokens · tablet (768px – 1023px): no overrides */",
    );
    expect(css).toMatch(
      /\/\* @authorkit-responsive tokens · desktop \(≥ 1024px\) \*\/\n@media \(min-width: 1024px\) \{\n {2}:root \{\n {4}--ak-font-size-h1: 2\.75rem;/,
    );
  });

  it("desktop-first: base holds large values; smaller screens override with max-width", () => {
    const css = renderTemplate("tokens", ctxFor("desktop-first"));
    expect(css).toContain("--ak-font-size-h1: 2.75rem;");
    expect(css).toMatch(
      /@media \(max-width: 1023px\) \{\n {2}:root \{\n {4}--ak-font-size-h1: 2rem;/,
    );
    // Mobile inherits the tablet override through the cascade, so it adds nothing.
    expect(css).toContain("/* @authorkit-responsive tokens · mobile (≤ 767px): no overrides */");
  });

  it("component hooks switch the header between drawer and inline nav", () => {
    const mobile = renderTemplate("header", ctxFor("mobile-first"));
    expect(mobile).toContain("--ak-header-toggle-display: inline-flex;");
    expect(mobile).toMatch(
      /@media \(min-width: 1024px\) \{\n {2}\.ak-header \{\n {4}--ak-header-toggle-display: none;/,
    );

    const desktop = renderTemplate("header", ctxFor("desktop-first"));
    expect(desktop).toContain("--ak-header-toggle-display: none;");
    expect(desktop).toMatch(
      /@media \(max-width: 1023px\) \{\n {2}\.ak-header \{\n {4}--ak-header-toggle-display: inline-flex;/,
    );
  });

  it("the four-step preset treats desktop and large as large screens", () => {
    const css = renderTemplate("tokens", ctxFor("mobile-first", "ak", preset("four-step")));
    expect(css).toContain("@media (min-width: 1024px)");
    expect(css).toContain("/* @authorkit-responsive tokens · large (≥ 1440px): no overrides */");
  });

  it("a single breakpoint renders base styles only", () => {
    const css = renderTemplate(
      "header",
      ctxFor("mobile-first", "ak", [{ id: "all", name: "all" }]),
    );
    expect(css).not.toContain("@media (min-width");
    expect(css).not.toContain("@authorkit-responsive");
  });
});

describe("prefix and brand", () => {
  it("uses the project prefix everywhere and never the default", async () => {
    const output = renderAll(ctxFor("mobile-first", "acme"));
    for (const [id, css] of Object.entries(output)) {
      expect(css, id).not.toMatch(/\bak-/);
      const result = await stylelint.lint({ code: css, config: outputStylelintConfig("acme") });
      expect(result.results[0].warnings, id).toEqual([]);
    }
    expect(output.cta).toContain(".acme-btn--primary {");
  });

  it("stylelint rejects classes without the prefix", async () => {
    const result = await stylelint.lint({
      code: ".btn { color: red; }\n",
      config: outputStylelintConfig("ak"),
    });
    expect(result.results[0].warnings.map((w) => w.rule)).toContain("selector-class-pattern");
  });

  it("brand names cannot break out of the header comment", () => {
    expect(commentSafe("Evil */ body { display: none } /*")).toBe(
      "Evil * / body { display: none } /*",
    );
    const css = renderTemplate(
      "cta",
      buildTemplateContext({
        brandName: "A */ x",
        prefix: "ak",
        approach: "mobile-first",
        breakpoints: threeStep,
      }),
    );
    expect(css.indexOf("*/")).toBeGreaterThan(css.indexOf("Variables used"));
    expect(renderTemplate("tokens", ctxFor("mobile-first"))).toContain(" * Variables defined:");
  });
});

describe("default tokens", () => {
  const color = (name: string) => TEMPLATE_DEFAULTS.tokens.find((t) => t.name === name)!.value;

  it.each([
    ["color-text", "color-background", 4.5],
    ["color-heading", "color-background", 4.5],
    ["color-text-muted", "color-background", 4.5],
    ["color-link", "color-background", 4.5],
    ["color-link-hover", "color-background", 4.5],
    ["color-on-primary", "color-primary", 4.5],
    ["color-on-primary", "color-primary-hover", 4.5],
    ["color-primary", "color-background", 4.5],
    ["color-isi-text", "color-isi-background", 4.5],
    ["color-isi-heading", "color-isi-background", 4.5],
    ["color-footer-text", "color-footer-background", 4.5],
    ["color-footer-link", "color-footer-background", 4.5],
    ["color-focus", "color-background", 3],
    ["color-focus", "color-isi-background", 3],
    ["color-focus-inverse", "color-footer-background", 3],
  ])("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
  });

  it("large-screen overrides only touch tokens and variables that have base values", () => {
    const names = new Set(TEMPLATE_DEFAULTS.tokens.map((t) => t.name));
    for (const name of Object.keys(TEMPLATE_DEFAULTS.largeScreen.tokens))
      expect(names).toContain(name);
    for (const [id, bySuffix] of Object.entries(TEMPLATE_DEFAULTS.largeScreen.components)) {
      for (const [suffix, vars] of Object.entries(bySuffix ?? {})) {
        const base = TEMPLATE_DEFAULTS.components[id as CssTemplateId]?.[suffix] ?? {};
        for (const name of Object.keys(vars))
          expect(base, `${id}/${suffix}/${name}`).toHaveProperty(name);
      }
    }
  });

  it("contrast ratio matches known values", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777", "#fff")).toBeCloseTo(4.48, 2);
  });
});
