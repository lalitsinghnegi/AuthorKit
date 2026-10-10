import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "@/lib/generator/types";
import { STYLE_GUIDE_DIR, entryFileName } from "@/lib/generator/naming";
import type { CssTemplateId, Project } from "@/lib/model";
import type { ComponentManifest } from "@/lib/templates/manifest";
import { getManifests } from "@/lib/templates/registry";
import { renderGuidePage } from "./page";
import { buildStatesCss } from "./states";
import { collectVariables } from "./variables";

const ASSETS = path.join(process.cwd(), "src", "templates", "styleguide");
const asset = (name: string) => readFileSync(path.join(ASSETS, name), "utf8");

/**
 * The static developer style guide for a package: index.html, its own CSS
 * and JS, and forced-state CSS. Built from the manifests and the package's
 * (quality-checked) CSS, so it cannot drift from what developers download.
 * Paths are relative to the package root, under style-guide/.
 */
export function generateStyleGuide(
  project: Pick<Project, "brandName" | "prefix" | "approach" | "breakpoints">,
  files: GeneratedFile[],
  manifests: Record<CssTemplateId, ComponentManifest> = getManifests(),
): GeneratedFile[] {
  const css = files.filter((f) => f.path.endsWith(".css"));
  const page = renderGuidePage({
    project,
    manifests,
    files,
    entryName: entryFileName(project),
    variables: collectVariables(css),
  });
  const file = (name: string, content: string): GeneratedFile => ({
    path: `${STYLE_GUIDE_DIR}/${name}`,
    content,
    source: "styleguide",
    templateId: null,
  });
  return [
    file("index.html", page),
    file("styleguide.css", asset("styleguide.css")),
    file("styleguide.js", asset("styleguide.js")),
    file("states.css", buildStatesCss(css.filter((f) => f.templateId).map((f) => f.content))),
  ];
}
