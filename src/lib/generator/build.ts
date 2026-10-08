import "server-only";
import type { Project } from "@/lib/model";
import { runQualityChecks, type QualityReport } from "@/lib/quality/run";
import { generatePackage, type GenerationInputs } from "./generate";
import type { GeneratedPackage } from "./types";

export type BuiltPackage = GeneratedPackage & { quality?: QualityReport };

/**
 * Generate, then fix and check. The returned files are the fixed ones; the
 * package is blocked when generation or any quality check reports an error.
 */
export async function buildPackage(
  project: Project,
  inputs: GenerationInputs = {},
): Promise<BuiltPackage> {
  const pkg = generatePackage(project, inputs);
  if (pkg.blocked) return pkg;
  const { files, quality } = await runQualityChecks(pkg, project);
  return { ...pkg, files, quality, blocked: quality.blocked };
}
