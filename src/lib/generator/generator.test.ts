import JSZip from "jszip";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/model";
import { COMPONENT_PRESET, addNode, createFile, createFolder } from "@/lib/scaffold";
import { outputStylelintConfig } from "@/lib/templates";
import { orderForImport, renderEntry } from "./entry";
import { checkProject, generatePackage } from "./generate";
import { entryFileName, reservedRootNames, zipFileName } from "./naming";
import { ZIP_DATE, assertSafePath, zipBuffer } from "./zip";

function fixture(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: "3f1c2a9e-8b7d-4c6e-9f1a-2b3c4d5e6f70",
    name: "Spring launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach: "mobile-first",
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
    ...overrides,
  };
}

describe("generatePackage", () => {
  it.each(["mobile-first", "desktop-first"] as const)("matches the snapshot (%s)", (approach) => {
    const pkg = generatePackage(fixture({ approach }));
    expect(pkg.blocked).toBe(false);
    expect(pkg.problems).toEqual([]);
    for (const file of pkg.files) {
      expect(file.content).toMatchSnapshot(`${approach}: ${file.path}`);
    }
  });

  it("lists generated files first, then the scaffold in tree order, with all folders", () => {
    const pkg = generatePackage(fixture());
    expect(pkg.rootName).toBe("acme-health");
    expect(pkg.files.map((f) => [f.path, f.source])).toEqual([
      ["acme-health.css", "entry"],
      ["README.md", "readme"],
      ["css/tokens.css", "template"],
      ["css/global.css", "template"],
      ["css/components/header.css", "template"],
      ["css/components/footer.css", "template"],
      ["css/components/isi.css", "template"],
      ["css/components/modals.css", "template"],
      ["css/components/cta.css", "template"],
      ["css/components/accordion.css", "template"],
    ]);
    expect(pkg.folders).toEqual(["css", "css/components"]);
  });

  it("puts the real file path in each template's header", () => {
    const cta = generatePackage(fixture()).files.find((f) => f.path.endsWith("cta.css"))!;
    expect(cta.content).toContain(" * Acme Health · css/components/cta.css");
  });

  it("every CSS file, including the entry, passes stylelint", async () => {
    for (const file of generatePackage(fixture()).files.filter((f) => f.path.endsWith(".css"))) {
      const result = await stylelint.lint({
        code: file.content,
        config: outputStylelintConfig("acme"),
      });
      expect(
        result.results[0].warnings.map((w) => w.text),
        file.path,
      ).toEqual([]);
    }
  });

  it("handles untemplated CSS, other files and empty folders", () => {
    let tree = fixture().scaffold;
    tree = addNode(tree, tree.id, createFolder("js", [createFile("app.js")]));
    tree = addNode(tree, tree.id, createFolder("fonts"));
    tree = addNode(tree, tree.id, createFile("overrides.css"));
    const pkg = generatePackage(fixture({ scaffold: tree }));

    expect(pkg.blocked).toBe(false);
    expect(pkg.problems).toEqual([
      { severity: "warning", message: "Empty folder", path: "fonts" },
      {
        severity: "warning",
        message: "No CSS template assigned; this file will be empty",
        path: "overrides.css",
      },
    ]);
    const byPath = Object.fromEntries(pkg.files.map((f) => [f.path, f]));
    expect(byPath["js/app.js"]).toMatchObject({ source: "empty", content: "" });
    expect(byPath["overrides.css"].source).toBe("empty-css");
    expect(byPath["overrides.css"].content).toContain("No CSS template is assigned");
    expect(pkg.folders).toEqual(["css", "css/components", "js", "fonts"]);
    // Untemplated CSS is imported last.
    expect(byPath["acme-health.css"].content.trim().split("\n").at(-1)).toBe(
      '@import url("overrides.css");',
    );
  });

  it("is deterministic", () => {
    expect(generatePackage(fixture())).toEqual(generatePackage(fixture()));
  });
});

describe("entry file", () => {
  it("imports in cascade order regardless of tree order, with relative paths", () => {
    const refs = [
      { path: "x/modals.css", templateId: "modals" as const },
      { path: "mine.css", templateId: null },
      { path: "a/b/cta.css", templateId: "cta" as const },
      { path: "tokens.css", templateId: "tokens" as const },
      { path: "base.css", templateId: "global" as const },
    ];
    expect(orderForImport(refs).map((r) => r.path)).toEqual([
      "tokens.css",
      "base.css",
      "a/b/cta.css",
      "x/modals.css",
      "mine.css",
    ]);
    expect(renderEntry("Acme", "acme.css", refs)).toContain('@import url("a/b/cta.css");');
  });

  it("is named after the brand, falling back to the prefix", () => {
    expect(entryFileName({ brandName: "Acme Health", prefix: "acme" })).toBe("acme-health.css");
    expect(entryFileName({ brandName: "®™", prefix: "acme" })).toBe("acme.css");
    expect(zipFileName({ brandName: "Acme Health", prefix: "acme" })).toBe(
      "acme-health-css-package.zip",
    );
  });
});

describe("README", () => {
  const readme = (p: Partial<Project> = {}) =>
    generatePackage(fixture(p)).files.find((f) => f.path === "README.md")!.content;

  it("documents quick start, order, tree, breakpoints and naming", () => {
    const text = readme();
    expect(text).toContain('<link rel="stylesheet" href="acme-health.css">');
    expect(text).toContain("1. `css/tokens.css`: Design tokens");
    expect(text).toContain("├── acme-health.css  ← entry, imports every stylesheet");
    expect(text).toContain("| tablet | 768px – 1023px | `@media (min-width: 768px)` |");
    expect(text).toContain("| mobile | ≤ 767px | base styles (no media query) |");
    expect(text).toContain("- Modifier: `.acme-btn--primary`");
    expect(text).toContain("| `css/components/cta.css` | CTA buttons | `.acme-btn`");
  });

  it("describes desktop-first ordering", () => {
    const text = readme({ approach: "desktop-first" });
    expect(text).toContain("| desktop | ≥ 1024px | base styles (no media query) |");
    expect(text).toContain("| mobile | ≤ 767px | `@media (max-width: 767px)` |");
    expect(text).toContain("Desktop-first");
  });

  it("keeps brand text from breaking markdown", () => {
    expect(readme({ brandName: "A|B `x`\nY" })).toContain("# AB x Y CSS package");
  });
});

describe("blocking problems", () => {
  it("blocks on a scaffold file that clashes with a generated name", () => {
    const tree = fixture().scaffold;
    const project = fixture({ scaffold: addNode(tree, tree.id, createFile("ACME-HEALTH.css")) });
    expect(reservedRootNames(project)).toEqual([
      "acme-health.css",
      "README.md",
      "VARIABLES.md",
      "index.html",
      "style-guide",
    ]);
    expect(
      reservedRootNames({ ...project, npm: { enabled: true, name: "x", version: "1.0.0" } }),
    ).toContain("package.json");
    const pkg = generatePackage(project);
    expect(pkg.blocked).toBe(true);
    expect(pkg.files).toEqual([]);
    expect(pkg.problems[0]).toEqual({
      severity: "error",
      message: '"acme-health.css" is generated automatically at the package root',
      path: "ACME-HEALTH.css",
    });
  });

  it("blocks on breakpoint errors and scaffold name errors", () => {
    const project = fixture();
    project.breakpoints.breakpoints[1].maxWidth = 1024;
    const tree = addNode(project.scaffold, project.scaffold.id, createFile("CON"));
    const problems = checkProject({ ...project, scaffold: tree });
    expect(problems.map((p) => p.message)).toEqual([
      '"CON" is a reserved name on Windows',
      "Breakpoints: tablet and desktop both match 1024px",
    ]);
  });
});

describe("zip", () => {
  it("contains every file and folder under the root with fixed dates", async () => {
    const pkg = generatePackage(
      fixture({
        scaffold: addNode(fixture().scaffold, fixture().scaffold.id, createFolder("fonts")),
      }),
    );
    const zip = await JSZip.loadAsync(await zipBuffer(pkg));
    const names = Object.keys(zip.files);
    expect(names).toEqual([
      "acme-health/",
      "acme-health/css/",
      "acme-health/css/components/",
      "acme-health/fonts/",
      ...pkg.files.map((f) => `acme-health/${f.path}`),
    ]);
    expect(zip.files["acme-health/fonts/"].dir).toBe(true);
    expect(await zip.file("acme-health/css/global.css")!.async("string")).toBe(
      pkg.files.find((f) => f.path === "css/global.css")!.content,
    );
    // DOS dates have 2-second precision and no time zone; compare the calendar date.
    expect(zip.files["acme-health/README.md"].date.getUTCFullYear()).toBe(
      ZIP_DATE.getUTCFullYear(),
    );
  });

  it("produces identical bytes for an unchanged project", async () => {
    const [a, b] = await Promise.all([
      zipBuffer(generatePackage(fixture())),
      zipBuffer(generatePackage(fixture())),
    ]);
    expect(a.equals(b)).toBe(true);
  });

  it("refuses unsafe paths and blocked packages", async () => {
    for (const bad of [
      "../x",
      "/abs",
      "a/../../b",
      "a\\b",
      "C:/x",
      "a//b",
      "",
      "a\0b",
      "a\nb",
      "./x",
    ]) {
      expect(() => assertSafePath(bad), bad).toThrow(/Unsafe path/);
    }
    const pkg = generatePackage(fixture());
    await expect(
      zipBuffer({ ...pkg, files: [{ ...pkg.files[0], path: "../evil.css" }] }),
    ).rejects.toThrow(/Unsafe/);
    await expect(zipBuffer({ ...pkg, blocked: true })).rejects.toThrow(/errors/);
  });
});
