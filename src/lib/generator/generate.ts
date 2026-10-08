import "server-only";
import { validateBreakpoints } from "@/lib/breakpoints";
import type { Project, TreeNode } from "@/lib/model";
import { nodePath, validateTree } from "@/lib/scaffold";
import { buildTemplateContext, commentSafe } from "@/lib/templates/context";
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
  return problems.sort(
    (a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"),
  );
}

/**
 * Build the whole package in memory. Deterministic: the same project always
 * produces the same files in the same order with the same content.
 */
export function generatePackage(project: Project): GeneratedPackage {
  const problems = checkProject(project);
  const blocked = problems.some((p) => p.severity === "error");
  const rootName = project.scaffold.name;
  if (blocked) return { rootName, files: [], folders: [], problems, blocked };

  const ctx = buildTemplateContext({
    brandName: project.brandName,
    prefix: project.prefix,
    approach: project.approach,
    breakpoints: project.breakpoints.breakpoints,
  });

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
        content: renderTemplate(node.cssTemplateId, ctx, path),
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
      content: renderReadme(project, entryName, cssRefs),
      source: "readme",
      templateId: null,
    },
    ...scaffoldFiles,
  ];
  return { rootName, files, folders, problems, blocked };
}
