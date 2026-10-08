import "server-only";
import stylelint from "stylelint";
import type { GeneratedFile, GeneratedPackage } from "@/lib/generator/types";
import type { Project } from "@/lib/model";
import { outputStylelintConfig } from "@/lib/templates/stylelintConfig";
import {
  checkClasses,
  checkLiterals,
  checkMediaOrder,
  checkUnused,
  checkVariables,
  measureSizes,
  type CheckId,
  type FileSize,
  type QualityIssue,
} from "./checks";
import { dedupeCss, formatCss, type Removal } from "./format";

export type QualityReport = {
  /** Checks that ran, with whether each passed without errors. */
  checks: { id: CheckId; label: string; errors: number; warnings: number }[];
  issues: QualityIssue[];
  /** Automatic fixes applied to the files (formatting changes and removed duplicates). */
  fixes: Removal[];
  sizes: FileSize[];
  blocked: boolean;
};

export const CHECK_LABELS: Record<CheckId, string> = {
  stylelint: "Stylelint rules",
  variables: "Every variable is defined",
  unused: "Unused variables",
  "media-order": "Media query order",
  classes: "Classes match the component docs",
  literals: "Values use variables",
  size: "File sizes",
};

const isCss = (f: GeneratedFile) => f.path.endsWith(".css");

async function lint(files: GeneratedFile[], prefix: string): Promise<QualityIssue[]> {
  const config = outputStylelintConfig(prefix);
  const issues: QualityIssue[] = [];
  for (const file of files.filter(isCss)) {
    const result = await stylelint.lint({ code: file.content, config });
    for (const w of result.results[0].warnings) {
      issues.push({
        check: "stylelint",
        severity: "error",
        message: w.text,
        path: file.path,
        line: w.line,
      });
    }
  }
  return issues;
}

/**
 * Fix what can be fixed (duplicates, formatting), then check the package.
 * Returns the fixed files and a report; any error blocks the download.
 */
export async function runQualityChecks(
  pkg: GeneratedPackage,
  project: Pick<Project, "prefix" | "approach" | "breakpoints">,
): Promise<{ files: GeneratedFile[]; quality: QualityReport }> {
  const fixes: Removal[] = [];
  const files = pkg.files.map((file) => {
    if (!isCss(file)) return file;
    const deduped = dedupeCss(file.content);
    fixes.push(...deduped.removed.map((r) => ({ ...r, path: file.path })));
    const formatted = formatCss(deduped.css);
    if (formatted !== deduped.css) fixes.push({ path: file.path, description: "Reformatted" });
    return { ...file, content: formatted };
  });

  const { sizes, issues: sizeIssues } = measureSizes(files);
  const issues = [
    ...(await lint(files, project.prefix)),
    ...checkVariables(files),
    ...checkUnused(files, project.prefix, pkg.report?.extras),
    ...checkMediaOrder(files, project.approach, project.breakpoints.breakpoints),
    ...checkClasses(files, project.prefix),
    ...checkLiterals(files),
    ...sizeIssues,
  ];

  const checks = (Object.keys(CHECK_LABELS) as CheckId[]).map((id) => ({
    id,
    label: CHECK_LABELS[id],
    errors: issues.filter((i) => i.check === id && i.severity === "error").length,
    warnings: issues.filter((i) => i.check === id && i.severity === "warning").length,
  }));
  return {
    files,
    quality: { checks, issues, fixes, sizes, blocked: issues.some((i) => i.severity === "error") },
  };
}
