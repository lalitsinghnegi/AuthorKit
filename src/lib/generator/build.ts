import "server-only";
import { renderPackageJson } from "@/lib/devkit/packageJson";
import { renderSamplePage } from "@/lib/devkit/sample";
import { renderVariablesDoc } from "@/lib/devkit/variablesDoc";
import type { CssTemplateId, Project } from "@/lib/model";
import { runQualityChecks, type QualityReport } from "@/lib/quality/run";
import { generateStyleGuide } from "@/lib/styleguide/generate";
import { classMapFor, mapManifests, mappedClasses } from "@/lib/selectors/map";
import type { ComponentManifest } from "@/lib/templates/manifest";
import { getManifests } from "@/lib/templates/registry";
import { generatePackage, type GenerationInputs } from "./generate";
import { PACKAGE_JSON, SAMPLE_PAGE, STYLE_GUIDE_DIR, VARIABLES_DOC, entryFileName } from "./naming";
import type { GeneratedFile, GeneratedPackage } from "./types";

export type BuiltPackage = GeneratedPackage & { quality?: QualityReport };

/**
 * Generate, then fix and check, then add the developer extras built from the
 * checked CSS: VARIABLES.md, the sample index.html, package.json (when the npm
 * option is on) and the style guide. The package is blocked when generation
 * or any quality check reports an error.
 */
export async function buildPackage(
  project: Project,
  inputs: GenerationInputs = {},
): Promise<BuiltPackage> {
  const pkg = generatePackage(project, inputs);
  if (pkg.blocked) return pkg;
  // With site selectors on, the CSS uses site classes, so every check and doc uses them too.
  const classMap = classMapFor(project);
  const manifests = mapManifests(getManifests(), classMap);
  const { files, quality } = await runQualityChecks(pkg, project, {
    manifests,
    siteClasses: mappedClasses(classMap),
  });
  const withExtras = addDeveloperExtras(project, files, pkg.report, manifests, (part) => {
    const target = classMap?.targets.get(part);
    return target ? target.cls : `${project.prefix}-${part}`;
  });
  return {
    ...pkg,
    files: withExtras,
    folders: [STYLE_GUIDE_DIR, ...pkg.folders],
    quality,
    blocked: quality.blocked,
  };
}

/** Generated root files go first (entry, README, then the extras), then the style guide, then the scaffold. */
export function addDeveloperExtras(
  project: Project,
  files: GeneratedFile[],
  report: GeneratedPackage["report"],
  manifests: Record<CssTemplateId, ComponentManifest> = getManifests(),
  classOf?: (part: string) => string,
): GeneratedFile[] {
  const entryName = entryFileName(project);
  const included = new Set(
    files.flatMap((f) => (f.templateId ? [f.templateId as CssTemplateId] : [])),
  );
  const extra = (path: string, content: string): GeneratedFile => ({
    path,
    content,
    source: "devkit",
    templateId: null,
  });

  const rootGenerated = files.filter((f) => f.source === "entry" || f.source === "readme");
  const rest = files.filter((f) => !rootGenerated.includes(f));
  return [
    ...rootGenerated,
    extra(VARIABLES_DOC, renderVariablesDoc(project, files, report)),
    extra(SAMPLE_PAGE, renderSamplePage(project, entryName, included, manifests, classOf)),
    ...(project.npm?.enabled
      ? [extra(PACKAGE_JSON, renderPackageJson(project, project.npm, entryName, files))]
      : []),
    ...generateStyleGuide(project, files, report?.extras, manifests),
    ...rest,
  ];
}
