import type { CssTemplateId } from "@/lib/model";
import type { GenerationReport } from "@/lib/templates/sources";

export type FileSource = "template" | "entry" | "readme" | "empty-css" | "empty";

export type GeneratedFile = {
  /** Path inside the package root, "/" separated, e.g. "css/global.css". */
  path: string;
  content: string;
  source: FileSource;
  templateId: CssTemplateId | null;
};

export type Problem = { severity: "error" | "warning"; message: string; path?: string };

export type GeneratedPackage = {
  rootName: string;
  /** Generated files first (entry, README), then the scaffold in tree order. */
  files: GeneratedFile[];
  /** Every folder path inside the root, including empty ones. */
  folders: string[];
  problems: Problem[];
  /** True when any problem is an error; files are then not produced. */
  blocked: boolean;
  /** Where every template value came from; absent when generation is blocked. */
  report?: GenerationReport;
};
