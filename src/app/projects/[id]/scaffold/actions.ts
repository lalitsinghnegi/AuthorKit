"use server";

import type { SaveResult } from "@/lib/actions/result";
import type {
  ScaffoldSavePayload,
  SaveAsPresetResult,
} from "@/components/ScaffoldEditor/ScaffoldEditor";
import { cloneWithNewIds } from "@/lib/scaffold";
import { checkTree } from "@/lib/scaffold/server";
import { reservedRootNames } from "@/lib/generator/naming";
import { getProject, updateProject } from "@/lib/storage/projects";
import { availableTemplateId, saveScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";

export async function saveProjectScaffoldAction(
  projectId: string,
  payload: ScaffoldSavePayload,
): Promise<SaveResult> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  const checked = checkTree(payload?.tree, { reservedRootNames: reservedRootNames(project) });
  if ("error" in checked) return { ok: false, error: checked.error };
  await updateProject(projectId, (p) => ({ ...p, scaffold: checked.tree }));
  return { ok: true };
}

export async function saveScaffoldAsPresetAction(
  name: string,
  tree: unknown,
): Promise<SaveAsPresetResult> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed.length > 80)
    return { ok: false, error: "Preset name must be 1–80 characters." };
  const checked = checkTree(tree);
  if ("error" in checked) return { ok: false, error: checked.error };
  const id = await availableTemplateId(trimmed);
  await saveScaffoldTemplate({
    schemaVersion: 1,
    id,
    name: trimmed,
    builtIn: false,
    tree: cloneWithNewIds(checked.tree),
  });
  return { ok: true, id, name: trimmed };
}
