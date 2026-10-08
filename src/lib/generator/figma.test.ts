import JSZip from "jszip";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import { runQualityChecks } from "@/lib/quality/run";
import { analyzeCss, literalDesignValues, outputStylelintConfig } from "@/lib/templates";
import { generate, project } from "@/test/figmaProject";
import { zipBuffer } from "./zip";

const content = (pkg: ReturnType<typeof generate>, path: string) =>
  pkg.files.find((f) => f.path === path)!.content;

describe("package generated from Figma", () => {
  it.each(["mobile-first", "desktop-first"] as const)("matches the snapshot (%s)", (approach) => {
    const pkg = generate(approach);
    expect(pkg.blocked).toBe(false);
    for (const f of pkg.files) expect(f.content).toMatchSnapshot(`${approach}: ${f.path}`);
    expect(pkg.report).toMatchSnapshot(`${approach}: report`);
  });

  it("fills tokens from Figma: accepted, overridden, excluded and extra", () => {
    const tokens = content(generate("mobile-first"), "css/tokens.css");
    expect(tokens).toContain("  --acme-color-primary: #8a0b4f;");
    expect(tokens).toContain("  --acme-color-primary-hover: #5a0632;");
    expect(tokens).toContain("  --acme-color-surface: #f4f6f8;"); // excluded → default
    expect(tokens).toContain('  --acme-font-family-heading: "Inter", system-ui');
    // The white CTA label is extracted too; neither name is a template token.
    expect(tokens).toMatch(
      /Extra values from Figma[^\n]*\n {2}--acme-color-label: #fff;\n {2}--acme-color-one-off-accent: #009980;/,
    );
  });

  it("uses measured typography per breakpoint instead of the built-in large-screen sizes", () => {
    const tokens = content(generate("mobile-first"), "css/tokens.css");
    expect(tokens).toContain("  --acme-font-size-h1: 1.75rem;");
    expect(tokens).toMatch(
      /@media \(min-width: 1024px\) \{\n {2}:root \{\n {4}--acme-font-size-h1: 2\.5rem;\n {4}--acme-font-size-h2: 2rem;/,
    );
    expect(tokens).not.toContain("--acme-font-size-h1: 2.75rem");
  });

  it("puts measured component values in base styles and media queries", () => {
    const pkg = generate("mobile-first");
    const header = content(pkg, "css/components/header.css");
    expect(header).toContain("  --acme-header-padding-x: 1rem;");
    const desktopQuery = header.slice(header.indexOf("@media (min-width: 1024px)"));
    expect(desktopQuery).toContain("--acme-header-padding-x: 2rem;");
    expect(desktopQuery).toContain("--acme-header-toggle-display: none;");
    expect(content(pkg, "css/components/footer.css")).toMatch(
      /@media \(min-width: 1024px\) \{\n {2}\.acme-footer \{\n {4}--acme-footer-direction: row;/,
    );
    expect(content(pkg, "css/components/cta.css")).toContain(
      "  --acme-btn-padding-x: clamp(1.125rem, 0.9545rem + 0.8523vw, 1.5rem);",
    );

    const desktop = content(generate("desktop-first"), "css/components/footer.css");
    expect(desktop).toContain("  --acme-footer-direction: row;");
    expect(desktop).toMatch(
      /@media \(max-width: 1023px\) \{\n {2}\.acme-footer \{\n {4}--acme-footer-direction: column;/,
    );
  });

  it("explains the sources in the report and README", () => {
    const pkg = generate("mobile-first");
    const report = pkg.report!;
    expect(report.rows.find((r) => r.name === "color-primary-hover")).toMatchObject({
      source: "override",
      value: "#5a0632",
    });
    expect(report.rows.find((r) => r.name === "btn-padding-x")).toMatchObject({
      source: "responsive-fluid",
    });
    expect(report.rows.find((r) => r.name === "color-surface")?.source).toBe("default");
    expect(report.extras).toEqual(["color-label", "color-one-off-accent"]);
    expect(report.attention.map((a) => a.message)).toContain(
      "Header: No header frame for tablet; values were copied from the nearest breakpoint.",
    );
    const readme = content(pkg, "README.md");
    expect(readme).toMatch(/- \*\*From Figma:\*\* \d+ values/);
    expect(readme).toContain(
      "- **Extra values from Figma:** `--acme-color-label`, `--acme-color-one-off-accent`",
    );
    expect(readme).toMatch(/- `tokens\.css`: [^\n]*`--acme-color-surface`/);
  });

  it.each(["mobile-first", "desktop-first"] as const)(
    "still passes every output check (%s)",
    async (approach) => {
      const pkg = generate(approach);
      const css = pkg.files.filter((f) => f.path.endsWith(".css"));
      for (const f of css) {
        const lint = await stylelint.lint({
          code: f.content,
          config: outputStylelintConfig("acme"),
        });
        expect(
          lint.results[0].warnings.map((w) => w.text),
          f.path,
        ).toEqual([]);
        expect(literalDesignValues(f.content), f.path).toEqual([]);
      }
      const facts = css.map((f) => analyzeCss(f.content));
      const declared = new Set(facts.flatMap((f) => [...f.declaredVariables]));
      expect(facts.flatMap((f) => [...f.usedVariables]).filter((v) => !declared.has(v))).toEqual(
        [],
      );
    },
  );

  it("is deterministic down to the zip bytes", async () => {
    expect(generate("mobile-first")).toEqual(generate("mobile-first"));
    const [a, b] = await Promise.all([
      zipBuffer(generate("mobile-first")),
      zipBuffer(generate("mobile-first")),
    ]);
    expect(a.equals(b)).toBe(true);
    const zip = await JSZip.loadAsync(a);
    expect(await zip.file("acme-health/css/tokens.css")!.async("string")).toContain("#5a0632");
  });

  it.each(["mobile-first", "desktop-first"] as const)(
    "passes the quality checks with no errors or fixes (%s)",
    async (approach) => {
      const pkg = generate(approach);
      const { files, quality } = await runQualityChecks(pkg, project(approach));
      expect(quality.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(quality.fixes).toEqual([]);
      expect(files).toEqual(pkg.files);
    },
  );
});
