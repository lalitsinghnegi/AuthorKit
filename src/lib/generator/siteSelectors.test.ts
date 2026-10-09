import { describe, expect, it } from "vitest";
import { inputs, project } from "@/test/figmaProject";
import { mappedProject } from "@/test/siteSelectorsProject";
import { buildPackage } from "./build";
import { generatePackage } from "./generate";

const fileOf = (pkg: { files: { path: string; content: string }[] }, end: string) =>
  pkg.files.find((f) => f.path.endsWith(end))!.content;

describe("packages with site selectors", () => {
  it("use the site classes everywhere and still pass every quality check", async () => {
    const pkg = await buildPackage(mappedProject(), inputs("mobile-first"));
    expect(pkg.blocked).toBe(false);
    expect(pkg.quality!.issues.filter((i) => i.severity === "error")).toEqual([]);

    const accordion = fileOf(pkg, "accordion.css");
    expect(accordion).toContain(".cmp-accordion__button");
    expect(accordion).not.toMatch(/\.acme-accordion__(trigger|panel|item)\b/);
    // Variables keep the prefix.
    expect(accordion).toContain("--acme-accordion-padding-y");
    expect(fileOf(pkg, "header.css")).toMatch(/\.cmp-experiencefragment--header \.cmp-image\b/);

    const sample = fileOf(pkg, "index.html");
    expect(sample).toContain('class="cmp-accordion"');
    expect(sample).toContain('"accordion__trigger":"cmp-accordion__button"');

    const guide = fileOf(pkg, "style-guide/index.html");
    expect(guide).toContain("cmp-modal__close");
    expect(guide).toContain(".cmp-experiencefragment--header .cmp-image");

    const readme = fileOf(pkg, "README.md");
    expect(readme).toContain("## Site selectors");
    expect(readme).toContain("| `.acme-accordion__trigger` | `.cmp-accordion__button` |");
    expect(readme).toContain(
      "| `.acme-header__logo` | `.cmp-experiencefragment--header .cmp-image` |",
    );
  });

  it("change nothing while switched off", () => {
    const plain = generatePackage(project("mobile-first"), inputs("mobile-first"));
    const off = generatePackage(mappedProject(false), inputs("mobile-first"));
    expect(off.files).toEqual(plain.files);
  });

  it("block generation when a mapping is invalid", () => {
    const bad = mappedProject();
    bad.siteSelectors!.mappings.push({
      componentId: "footer",
      part: "footer__logo",
      selector: ".cmp-image",
      scoped: true,
      state: "confirmed",
    });
    const pkg = generatePackage(bad, inputs("mobile-first"));
    expect(pkg.blocked).toBe(true);
    expect(pkg.problems.map((p) => p.message).join(" ")).toMatch(
      /Site selectors: Confirm a site class for \.acme-footer first/,
    );
  });
});
