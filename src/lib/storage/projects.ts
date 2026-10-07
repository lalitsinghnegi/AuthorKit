import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultBreakpoints, defaultScaffold } from "@/lib/model/defaults";
import {
  type DesignToken,
  type Project,
  Project as ProjectSchema,
  ProjectExport,
  ProjectInput,
  SCHEMA_VERSION,
  TokenFile,
} from "@/lib/model";
import { listEntries, readJson, removeDataPath, writeJsonAtomic } from "./files";

const projectDir = (id: string) => `projects/${id}`;
const projectFile = (id: string) => `${projectDir(id)}/project.json`;
const tokensFile = (id: string) => `${projectDir(id)}/tokens.json`;

const isProjectId = (id: string) => z.uuid().safeParse(id).success;

function requireId(id: string): void {
  if (!isProjectId(id)) throw new Error(`Invalid project id: ${id}`);
}

/** Folder-safe slug used for the scaffold root, e.g. "Acme Health" → "acme-health". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type ProjectList = { projects: Project[]; invalid: string[] };

/** All projects, most recently updated first. Folders with unreadable files are reported, not thrown. */
export async function listProjects(): Promise<ProjectList> {
  const ids = (await listEntries("projects")).filter(isProjectId);
  const projects: Project[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    try {
      const project = await readJson(projectFile(id), ProjectSchema);
      if (project) projects.push(project);
    } catch {
      invalid.push(id);
    }
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projects, invalid };
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null;
  return readJson(projectFile(id), ProjectSchema);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const fields = ProjectInput.parse(input);
  const now = new Date().toISOString();
  const project = ProjectSchema.parse({
    ...fields,
    schemaVersion: SCHEMA_VERSION,
    id: randomUUID(),
    breakpoints: defaultBreakpoints(),
    scaffold: defaultScaffold(slugify(fields.brandName) || fields.prefix),
    figmaLinks: [],
    createdAt: now,
    updatedAt: now,
  });
  await writeJsonAtomic(projectFile(project.id), project);
  return project;
}

/**
 * Read-modify-write a project. The result is validated before saving and
 * `updatedAt` is bumped. Last write wins; there is a single admin editing at a time.
 */
export async function updateProject(
  id: string,
  change: (project: Project) => Project,
): Promise<Project> {
  const current = await getProject(id);
  if (!current) throw new Error(`Project not found: ${id}`);
  const next = ProjectSchema.parse({
    ...change(structuredClone(current)),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonAtomic(projectFile(id), next);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  requireId(id);
  await removeDataPath(projectDir(id));
}

export async function getTokens(id: string): Promise<DesignToken[]> {
  requireId(id);
  return (await readJson(tokensFile(id), TokenFile))?.tokens ?? [];
}

export async function saveTokens(id: string, tokens: DesignToken[]): Promise<void> {
  requireId(id);
  const file = TokenFile.parse({ schemaVersion: SCHEMA_VERSION, tokens });
  await writeJsonAtomic(tokensFile(id), file);
}

export async function exportProject(id: string): Promise<ProjectExport | null> {
  const project = await getProject(id);
  if (!project) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "authorkit-project",
    project,
    tokens: await getTokens(id),
  };
}

/** Import an exported project as a new project (fresh id and timestamps). */
export async function importProject(data: unknown): Promise<Project> {
  const parsed = ProjectExport.parse(data);
  const now = new Date().toISOString();
  const project = ProjectSchema.parse({
    ...parsed.project,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
  await writeJsonAtomic(projectFile(project.id), project);
  if (parsed.tokens.length > 0) await saveTokens(project.id, parsed.tokens);
  return project;
}
