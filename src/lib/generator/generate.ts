import "server-only";
import { validateBreakpoints } from "@/lib/breakpoints";
import type { DesignToken, Project, ResponsiveFile, TreeNode } from "@/lib/model";
import { nodePath, validateTree } from "@/lib/scaffold";
import {
  classMapFor,
  mapCss,
  mappableParts,
  validateMappings,
  type ClassMap,
} from "@/lib/selectors/map";
import { buildTemplateContextWithReport, commentSafe } from "@/lib/templates/context";
import { getManifests } from "@/lib/templates/registry";
import { renderTemplate } from "@/lib/templates/render";
import { renderEntry, type CssFileRef } from "./entry";
import { README_NAME, entryFileName, reservedRootNames } from "./naming";
import { renderReadme } from "./readme";
import type { GeneratedFile, GeneratedPackage, Problem } from "./types";

const isCss = (name: string) => name.toLowerCase().endsWith(".css");

/** Check everything that would make the package wrong. Errors block generation. */
export function checkProject(project: Project): Problem[] {
  const problems: Problem[] = [];
  for (const issue of validateTree(project.scaffold, {
    reservedRootNames: reservedRootNames(project),
  })) {
    // Paths inside the package, without the root folder name.
    const path =
      nodePath(project.scaffold, issue.nodeId).split("/").slice(1).join("/") || undefined;
    problems.push({ severity: issue.severity, message: issue.message, path });
  }
  for (const issue of validateBreakpoints(project.breakpoints.breakpoints)) {
    problems.push({ severity: issue.severity, message: `Breakpoints: ${issue.message}` });
  }
  if (project.siteSelectors?.enabled) {
    const parts = mappableParts(getManifests());
    for (const issue of validateMappings(project.siteSelectors.mappings, parts, project.prefix)) {
      problems.push({ severity: "error", message: `Site selectors: ${issue.message}` });
    }
  }
  return problems.sort(
    (a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"),
  );
}

/**
 * Build the whole package in memory. Deterministic: the same project always
 * produces the same files in the same order with the same content.
 */
/** Saved Figma-derived inputs; both optional (defaults are used without them). */
export type GenerationInputs = {
  tokens?: readonly DesignToken[];
  responsive?: ResponsiveFile | null;
};

export function generatePackage(project: Project, inputs: GenerationInputs = {}): GeneratedPackage {
  const problems = checkProject(project);
  const blocked = problems.some((p) => p.severity === "error");
  const rootName = project.scaffold.name;
  if (blocked) return { rootName, files: [], folders: [], problems, blocked };

  const { context: ctx, report } = buildTemplateContextWithReport({
    brandName: project.brandName,
    prefix: project.prefix,
    approach: project.approach,
    breakpoints: project.breakpoints.breakpoints,
    tokens: inputs.tokens,
    responsive: inputs.responsive,
  });

  const classMap = classMapFor(project);
  const scaffoldFiles: GeneratedFile[] = [];
  const folders: string[] = [];
  const visit = (node: TreeNode, path: string) => {
    if (node.type === "folder") {
      if (path) folders.push(path);
      for (const child of node.children) visit(child, path ? `${path}/${child.name}` : child.name);
      return;
    }
    if (node.cssTemplateId) {
      scaffoldFiles.push({
        path,
        content: mapped(renderTemplate(node.cssTemplateId, ctx, path), classMap),
        source: "template",
        templateId: node.cssTemplateId,
      });
    } else if (isCss(node.name)) {
      scaffoldFiles.push({
        path,
        content: [
          "/*!",
          ` * ${commentSafe(project.brandName)} · ${path}`,
          " * No CSS template is assigned to this file. Add your own styles here,",
          " * or assign a template in AuthorKit and regenerate.",
          " */",
          "",
        ].join("\n"),
        source: "empty-css",
        templateId: null,
      });
    } else {
      scaffoldFiles.push({ path, content: "", source: "empty", templateId: null });
    }
  };
  visit(project.scaffold, "");

  const cssRefs: CssFileRef[] = scaffoldFiles
    .filter((f) => isCss(f.path))
    .map((f) => ({ path: f.path, templateId: f.templateId }));
  const entryName = entryFileName(project);

  const files: GeneratedFile[] = [
    {
      path: entryName,
      content: renderEntry(project.brandName, entryName, cssRefs),
      source: "entry",
      templateId: null,
    },
    {
      path: README_NAME,
      content: renderReadme(project, entryName, cssRefs, report) + selectorsReadme(classMap),
      source: "readme",
      templateId: null,
    },
    ...scaffoldFiles,
  ];
  return { rootName, files, folders, problems, blocked, report };
}

const mapped = (css: string, map: ClassMap | null) => (map ? mapCss(css, map) : css);

/** README section listing the site classes used instead of template classes. */
function selectorsReadme(map: ClassMap | null): string {
  if (!map) return "";
  const rows = [...map.targets]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([part, t]) =>
        `| \`.${map.prefix}-${part}\` | \`${t.scope ? `.${t.scope} ` : ""}.${t.cls}\` |`,
    );
  return [
    "",
    "## Site selectors",
    "",
    "These classes from the published site are used instead of the template classes, so the CSS styles the site's markup as it is. The style guide and sample page use them too.",
    "",
    "| Template class | Site selector |",
    "| --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
