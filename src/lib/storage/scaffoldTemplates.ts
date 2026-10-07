import { ScaffoldTemplate } from "@/lib/model";
import { BUILT_IN_SCAFFOLDS, isBuiltInScaffoldId } from "@/lib/scaffold/presets";
import { listEntries, readJson, removeDataPath, writeJsonAtomic } from "./files";

const DIR = "scaffold-templates";
const ID = /^[a-z0-9-]{1,64}$/;

function fileFor(id: string): string {
  if (!ID.test(id)) throw new Error(`Invalid scaffold template id: ${id}`);
  return `${DIR}/${id}.json`;
}

async function listCustom(): Promise<ScaffoldTemplate[]> {
  const names = await listEntries(DIR, { files: true });
  const templates: ScaffoldTemplate[] = [];
  for (const name of names) {
    const id = name.replace(/\.json$/, "");
    if (!name.endsWith(".json") || !ID.test(id) || isBuiltInScaffoldId(id)) continue;
    const template = await readJson(fileFor(id), ScaffoldTemplate);
    if (template) templates.push({ ...template, builtIn: false });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/** Built-in presets first, then custom ones by name. */
export async function listScaffoldTemplates(): Promise<ScaffoldTemplate[]> {
  return [...BUILT_IN_SCAFFOLDS, ...(await listCustom())];
}

export async function getScaffoldTemplate(id: string): Promise<ScaffoldTemplate | null> {
  const builtIn = BUILT_IN_SCAFFOLDS.find((t) => t.id === id);
  if (builtIn) return builtIn;
  if (!ID.test(id)) return null;
  const template = await readJson(fileFor(id), ScaffoldTemplate);
  return template && { ...template, builtIn: false };
}

export async function saveScaffoldTemplate(template: ScaffoldTemplate): Promise<ScaffoldTemplate> {
  if (isBuiltInScaffoldId(template.id))
    throw new Error("Built-in scaffold templates cannot be changed");
  const valid = ScaffoldTemplate.parse({ ...template, builtIn: false });
  await writeJsonAtomic(fileFor(valid.id), valid);
  return valid;
}

export async function deleteScaffoldTemplate(id: string): Promise<void> {
  if (isBuiltInScaffoldId(id)) throw new Error("Built-in scaffold templates cannot be deleted");
  await removeDataPath(fileFor(id));
}

/** A template id derived from a name that is not taken yet: "my-preset", "my-preset-2", … */
export async function availableTemplateId(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "preset";
  const taken = new Set((await listScaffoldTemplates()).map((t) => t.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
