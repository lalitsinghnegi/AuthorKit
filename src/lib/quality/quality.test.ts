import { describe, expect, it } from "vitest";
import { generatePackage } from "@/lib/generator/generate";
import type { GeneratedPackage } from "@/lib/generator/types";
import type { Project } from "@/lib/model";
import { COMPONENT_PRESET } from "@/lib/scaffold";
import { SIZE_LIMITS } from "./checks";
import { dedupeCss, formatCss } from "./format";
import { runQualityChecks } from "./run";

function project(approach: Project["approach"] = "mobile-first"): Project {
  return {
    schemaVersion: 1,
    id: "3f1c2a9e-8b7d-4c6e-9f1a-2b3c4d5e6f70",
    name: "Spring launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach,
    breakpoints: {
      breakpoints: [
        { id: "m", name: "mobile", maxWidth: 767 },
        { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
        { id: "d", name: "desktop", minWidth: 1024 },
      ],
    },
    scaffold: { ...COMPONENT_PRESET.tree, name: "acme-health" },
    figmaLinks: [],
    createdAt: "2026-10-07T12:00:00.000Z",
    updatedAt: "2026-10-07T12:00:00.000Z",
  };
}

/** The default package with one file changed by `edit`. */
function broken(
  path: string,
  edit: (css: string) => string,
  approach: Project["approach"] = "mobile-first",
): GeneratedPackage {
  const pkg = generatePackage(project(approach));
  return {
    ...pkg,
    files: pkg.files.map((f) => (f.path === path ? { ...f, content: edit(f.content) } : f)),
  };
}

const run = (pkg: GeneratedPackage, approach: Project["approach"] = "mobile-first") =>
  runQualityChecks(pkg, project(approach));
const errorsOf = async (pkg: GeneratedPackage, approach?: Project["approach"]) =>
  (await run(pkg, approach)).quality.issues.filter((i) => i.severity === "error");

const CTA = "css/components/cta.css";
const HEADER = "css/components/header.css";

describe("a clean package", () => {
  it.each(["mobile-first", "desktop-first"] as const)(
    "passes with no errors and needs no fixes (%s)",
    async (approach) => {
      const pkg = generatePackage(project(approach));
      const { files, quality } = await run(pkg, approach);
      expect(quality.blocked).toBe(false);
      expect(quality.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(quality.fixes).toEqual([]);
      expect(files).toEqual(pkg.files);
      expect(quality.checks.map((c) => c.id)).toEqual([
        "stylelint",
        "variables",
        "unused",
        "media-order",
        "classes",
        "literals",
        "size",
      ]);
      expect(quality.sizes.find((s) => s.path === CTA)).toMatchObject({
        rules: expect.any(Number),
        declarations: expect.any(Number),
      });
      expect(quality.sizes.every((s) => s.gzip < s.bytes || s.bytes < 600)).toBe(true);
    },
  );

  it("summarises unused tokens in one note", async () => {
    const { quality } = await run(generatePackage(project()));
    const unused = quality.issues.filter((i) => i.check === "unused");
    expect(unused).toHaveLength(1);
    expect(unused[0]).toMatchObject({ severity: "warning", path: "css/tokens.css" });
    expect(unused[0].message).toMatch(
      /^\d+ tokens are defined but not used by this package's CSS \(available for your own CSS\): --acme-/,
    );
  });
});

describe("deliberately broken output", () => {
  it("catches an undefined variable (error) and one with a fallback (warning)", async () => {
    const pkg = broken(CTA, (css) =>
      css.replace(
        "cursor: pointer;",
        "cursor: pointer;\n  outline-color: var(--acme-nope);\n  color: var(--acme-also-nope, red);",
      ),
    );
    const issues = (await run(pkg)).quality.issues.filter((i) => i.check === "variables");
    expect(issues).toEqual([
      {
        check: "variables",
        severity: "error",
        message: "--acme-nope is used but never defined",
        path: CTA,
        line: expect.any(Number),
      },
      {
        check: "variables",
        severity: "warning",
        message: "--acme-also-nope is used but never defined (its fallback value is used)",
        path: CTA,
        line: expect.any(Number),
      },
    ]);
  });

  it("warns about an unused component variable", async () => {
    const pkg = broken(CTA, (css) =>
      css.replace(".acme-btn {\n", ".acme-btn {\n  --acme-btn-unused: 1px;\n"),
    );
    const unused = (await run(pkg)).quality.issues.filter(
      (i) => i.check === "unused" && i.message.includes("btn-unused"),
    );
    expect(unused).toEqual([
      {
        check: "unused",
        severity: "warning",
        message: "--acme-btn-unused is defined but never used",
        path: CTA,
        line: expect.any(Number),
      },
    ]);
  });

  it("catches undocumented and missing classes", async () => {
    const pkg = broken(CTA, (css) => css.replace(".acme-btn--block {", ".acme-btn--huge {"));
    const messages = (await errorsOf(pkg))
      .filter((i) => i.check === "classes")
      .map((i) => i.message);
    expect(messages).toEqual([
      ".acme-btn--huge is not documented in the cta manifest",
      ".acme-btn--block is documented in the cta manifest but missing from the CSS",
    ]);
  });

  it("catches media queries out of cascade order and of the wrong kind", async () => {
    const reversed = broken(
      HEADER,
      (css) =>
        css +
        "\n@media (min-width: 768px) {\n  .acme-header {\n    --acme-header-gap: 0;\n  }\n}\n",
    );
    expect((await errorsOf(reversed)).find((i) => i.check === "media-order")?.message).toBe(
      "“(min-width: 768px)” comes after a larger breakpoint (1024px), so the cascade would override it",
    );

    const wrongKind = broken(
      HEADER,
      (css) =>
        css +
        "\n@media (max-width: 767px) {\n  .acme-header {\n    --acme-header-gap: 0;\n  }\n}\n",
    );
    expect((await errorsOf(wrongKind)).find((i) => i.check === "media-order")?.message).toBe(
      "max-width query “(max-width: 767px)” in a mobile-first package",
    );

    const unknown = broken(
      HEADER,
      (css) =>
        css +
        "\n@media (min-width: 1440px) {\n  .acme-header {\n    --acme-header-gap: 0;\n  }\n}\n",
    );
    expect((await run(unknown)).quality.issues).toContainEqual(
      expect.objectContaining({
        check: "media-order",
        severity: "warning",
        message: "1440px is not one of the project's breakpoints",
      }),
    );
  });

  it("checks desktop-first ordering the other way round", async () => {
    const pkg = broken(
      "css/tokens.css",
      (css) =>
        css +
        "\n@media (max-width: 767px) {\n  :root {\n    --acme-space-1: 1px;\n  }\n}\n" +
        "\n@media (max-width: 1023px) {\n  :root {\n    --acme-space-2: 1px;\n  }\n}\n",
      "desktop-first",
    );
    const messages = (await errorsOf(pkg, "desktop-first"))
      .filter((i) => i.check === "media-order")
      .map((i) => i.message);
    expect(messages).toEqual([
      "“(max-width: 1023px)” comes after a smaller breakpoint (767px), so the cascade would override it",
    ]);
  });

  it("reports stylelint problems such as unprefixed classes, and blocks", async () => {
    const pkg = broken(CTA, (css) => css + "\n.btn {\n  color: var(--acme-btn-color);\n}\n");
    const { quality } = await run(pkg);
    expect(quality.blocked).toBe(true);
    expect(quality.issues).toContainEqual(
      expect.objectContaining({
        check: "stylelint",
        severity: "error",
        path: CTA,
        message: expect.stringMatching(/Class "\.btn" must be BEM with the "acme-" prefix/),
      }),
    );
    expect(quality.checks.find((c) => c.id === "stylelint")!.errors).toBeGreaterThan(0);
  });

  it("removes duplicate rules and declarations and reports them", async () => {
    const pkg = broken(CTA, (css) =>
      css
        .replace("  cursor: pointer;\n", "  cursor: pointer;\n  cursor: pointer;\n")
        .replace(
          ".acme-btn__icon {",
          ".acme-btn--block {\n  display: flex;\n  width: 100%;\n}\n\n.acme-btn__icon {",
        ),
    );
    const { files, quality } = await run(pkg);
    expect(quality.fixes).toEqual([
      { path: CTA, description: "Duplicate declaration “cursor: pointer” in .acme-btn" },
      { path: CTA, description: "Duplicate rule .acme-btn--block" },
    ]);
    const fixed = files.find((f) => f.path === CTA)!.content;
    expect(fixed).toBe(generatePackage(project()).files.find((f) => f.path === CTA)!.content);
    expect(quality.blocked).toBe(false);
  });

  it("reformats messy CSS and the result is stable", async () => {
    const pkg = broken(CTA, (css) =>
      css.replace(/\n {2}/g, "\n      ").replace(/\n\n/g, "\n\n\n\n"),
    );
    const { files, quality } = await run(pkg);
    expect(quality.fixes).toContainEqual({ path: CTA, description: "Reformatted" });
    const fixed = files.find((f) => f.path === CTA)!.content;
    expect(fixed).toBe(generatePackage(project()).files.find((f) => f.path === CTA)!.content);
    expect(formatCss(fixed)).toBe(fixed);
  });

  it("warns about literal design values and oversized files", async () => {
    const big = "/* " + "x".repeat(SIZE_LIMITS.file) + " */\n";
    const pkg = broken(
      CTA,
      (css) => css.replace("cursor: pointer;", "cursor: pointer;\n  margin-top: 13px;") + big,
    );
    const warnings = (await run(pkg)).quality.issues
      .filter((i) => i.severity === "warning")
      .map((i) => i.check);
    expect(warnings).toContain("literals");
    expect(warnings).toContain("size");
  });
});

describe("format and dedupe helpers", () => {
  it("keeps values, comments and the blank line between custom properties and declarations", () => {
    const css =
      "/* a */\n.x{--p-a:1px;\n\n\n color:var(--p-a)}\n.y,.z{margin:0}\n@media (min-width:1px){.x{color:red}}";
    expect(formatCss(css)).toBe(
      "/* a */\n.x {\n  --p-a: 1px;\n\n  color: var(--p-a);\n}\n\n.y,\n.z {\n  margin: 0;\n}\n\n@media (min-width:1px) {\n  .x {\n    color: red;\n  }\n}\n",
    );
  });

  it("only removes exact duplicates", () => {
    const { removed } = dedupeCss(
      ".a{color:red}.a{color:blue}.a{color:red}@media (x){.a{color:red}}",
    );
    expect(removed).toEqual([{ description: "Duplicate rule .a" }]);
  });
});
