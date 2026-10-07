import { ScaffoldTemplate } from "@/lib/model";
import { listEntries, readJson, removeDataPath, writeJsonAtomic } from "./files";

const DIR = "scaffold-templates";
const ID = /^[a-z0-9-]{1,64}$/;

function fileFor(id: string): string {
  if (!ID.test(id)) throw new Error(`Invalid scaffold template id: ${id}`);
  return `${DIR}/${id}.json`;
}

export async function listScaffoldTemplates(): Promise<ScaffoldTemplate[]> {
  const names = await listEntries(DIR, { files: true });
  const templates: ScaffoldTemplate[] = [];
  for (const name of names) {
    const id = name.replace(/\.json$/, "");
    if (!name.endsWith(".json") || !ID.test(id)) continue;
    const template = await readJson(fileFor(id), ScaffoldTemplate);
    if (template) templates.push(template);
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getScaffoldTemplate(id: string): Promise<ScaffoldTemplate | null> {
  if (!ID.test(id)) return null;
  return readJson(fileFor(id), ScaffoldTemplate);
}

export async function saveScaffoldTemplate(template: ScaffoldTemplate): Promise<ScaffoldTemplate> {
  const valid = ScaffoldTemplate.parse(template);
  await writeJsonAtomic(fileFor(valid.id), valid);
  return valid;
}

export async function deleteScaffoldTemplate(id: string): Promise<void> {
  const existing = await getScaffoldTemplate(id);
  if (existing?.builtIn) throw new Error("Built-in scaffold templates cannot be deleted");
  await removeDataPath(fileFor(id));
}
