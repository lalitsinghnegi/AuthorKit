import type { GeneratedFile } from "@/lib/generator/types";
import type { Project } from "@/lib/model";
import { collectVariables } from "@/lib/styleguide/variables";
import { analyzeCss } from "@/lib/templates/analyze";
import type { GenerationReport } from "@/lib/templates/sources";

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");

/**
 * VARIABLES.md: for each CSS file, the custom properties it defines (base
 * value and per-breakpoint values) and the ones it uses, with the file that
 * defines each. Built from the final CSS, so it always matches the package.
 */
export function renderVariablesDoc(
  project: Pick<Project, "brandName" | "prefix">,
  files: GeneratedFile[],
  report?: GenerationReport,
): string {
  const css = files.filter((f) => f.path.endsWith(".css"));
  const all = collectVariables(css);
  const lines = [
    `# ${cell(project.brandName)}: CSS variables`,
    "",
    `Every custom property in this package, file by file. All names start with \`--${project.prefix}-\`.`,
    "Override a variable after loading the package to change it everywhere it is used.",
    "",
  ];

  if (report) {
    const defaults = report.rows.filter((r) => r.source === "default").length;
    lines.push(
      `From Figma: ${report.rows.length - defaults} · AuthorKit defaults: ${defaults}.`,
      "",
    );
  }

  for (const file of css) {
    const own = collectVariables([file]);
    const used = [...analyzeCss(file.content).usedVariables].sort();
    if (own.size === 0 && used.length === 0) continue;
    lines.push(`## \`${file.path}\``, "");
    if (own.size) {
      lines.push("Defines:", "", "| Variable | Value | Per breakpoint |", "| --- | --- | --- |");
      for (const [name, v] of own) {
        const overrides = v.overrides
          .map((o) => `\`${cell(o.condition)}\`: \`${cell(o.value)}\``)
          .join("<br>");
        lines.push(`| \`--${name}\` | \`${cell(v.base ?? "")}\` | ${overrides || "—"} |`);
      }
      lines.push("");
    }
    if (used.length) {
      lines.push(
        "Uses:",
        "",
        ...used.map((name) => {
          const from = all.get(name)?.file;
          return `- \`--${name}\`${from && from !== file.path ? ` (from \`${from}\`)` : ""}`;
        }),
        "",
      );
    }
  }
  return lines.join("\n");
}
