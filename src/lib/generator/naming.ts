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

/** Root names the generator writes itself; scaffold files may not use them. */
export const reservedRootNames = (project: Pick<Project, "brandName" | "prefix">) => [
  entryFileName(project),
  README_NAME,
];
