import type { Project } from "@/lib/model";
import { slugify } from "@/lib/storage/slug";

export const README_NAME = "README.md";

/** "Acme Health" → "acme-health"; falls back to the prefix when the brand has no usable letters. */
export const brandSlug = (project: Pick<Project, "brandName" | "prefix">) =>
  slugify(project.brandName) || project.prefix;

/** The brand entry stylesheet at the package root, e.g. "acme-health.css". */
export const entryFileName = (project: Pick<Project, "brandName" | "prefix">) =>
  `${brandSlug(project)}.css`;

export const zipFileName = (project: Pick<Project, "brandName" | "prefix">) =>
  `${brandSlug(project)}-css-package.zip`;

export const VARIABLES_DOC = "VARIABLES.md";
export const SAMPLE_PAGE = "index.html";
export const PACKAGE_JSON = "package.json";
export const STYLE_GUIDE_DIR = "style-guide";

type NamingProject = Pick<Project, "brandName" | "prefix"> & Partial<Pick<Project, "npm">>;

/** Default npm name: "<brand-slug>-css". */
export const defaultNpmName = (project: Pick<Project, "brandName" | "prefix">) =>
  `${brandSlug(project)}-css`;

/** Files and folders the generator adds at the package root, with a note for the scaffold designer. */
export function generatedRootEntries(project: NamingProject): { name: string; note: string }[] {
  return [
    { name: entryFileName(project), note: "entry, imports every stylesheet" },
    { name: README_NAME, note: "package guide" },
    { name: VARIABLES_DOC, note: "every CSS variable per file" },
    { name: SAMPLE_PAGE, note: "sample page using the components" },
    ...(project.npm?.enabled ? [{ name: PACKAGE_JSON, note: "npm package manifest" }] : []),
    { name: `${STYLE_GUIDE_DIR}/`, note: "developer style guide (folder)" },
  ];
}

/** Root names the generator writes itself; scaffold files and folders may not use them. */
export const reservedRootNames = (project: NamingProject) =>
  generatedRootEntries(project).map((e) => e.name.replace(/\/$/, ""));
