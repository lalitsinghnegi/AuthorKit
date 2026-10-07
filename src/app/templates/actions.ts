"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ScaffoldSavePayload } from "@/components/ScaffoldEditor/ScaffoldEditor";
import type { SaveResult } from "@/lib/actions/result";
import { ScaffoldExport } from "@/lib/model";
import { cloneWithNewIds, createFolder } from "@/lib/scaffold";
import { checkTree, firstMessage } from "@/lib/scaffold/server";
import {
  availableTemplateId,
  deleteScaffoldTemplate,
  getScaffoldTemplate,
  saveScaffoldTemplate,
} from "@/lib/storage/scaffoldTemplates";

export async function createScaffoldTemplateAction(): Promise<void> {
  const id = await availableTemplateId("New preset");
  await saveScaffoldTemplate({
    schemaVersion: 1,
    id,
    name: "New preset",
    builtIn: false,
    tree: createFolder("package", [createFolder("css")]),
  });
  redirect(`/templates/scaffolds/${id}`);
}

export async function duplicateScaffoldTemplateAction(sourceId: string): Promise<void> {
  const source = await getScaffoldTemplate(sourceId);
  if (!source) redirect("/templates");
  const name = `${source.name} copy`.slice(0, 80);
  const id = await availableTemplateId(name);
  await saveScaffoldTemplate({
    schemaVersion: 1,
    id,
    name,
    description: source.description,
    builtIn: false,
    tree: cloneWithNewIds(source.tree),
  });
  redirect(`/templates/scaffolds/${id}`);
}

export async function deleteScaffoldTemplateAction(id: string): Promise<void> {
  await deleteScaffoldTemplate(id);
  redirect("/templates");
}

export async function saveScaffoldTemplateAction(
  id: string,
  payload: ScaffoldSavePayload,
): Promise<SaveResult> {
  const existing = await getScaffoldTemplate(id);
  if (!existing) return { ok: false, error: "This preset no longer exists." };
  if (existing.builtIn)
    return { ok: false, error: "Built-in presets are read-only. Duplicate it to edit." };
  const name = String(payload?.name ?? "").trim();
  if (!name || name.length > 80)
    return { ok: false, error: "Preset name must be 1–80 characters." };
  const checked = checkTree(payload?.tree);
  if ("error" in checked) return { ok: false, error: checked.error };

  const description = String(payload?.description ?? "").trim();
  await saveScaffoldTemplate({
    ...existing,
    name,
    description: description ? description.slice(0, 500) : undefined,
    tree: checked.tree,
  });
  return { ok: true };
}

export type ImportState = { error?: string };
const MAX_IMPORT_BYTES = 1024 * 1024;

export async function importScaffoldTemplateAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a preset .json file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "File is larger than 1 MB." };

  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: "File is not valid JSON." };
  }
  if ((data as { kind?: unknown } | null)?.kind !== "authorkit-scaffold") {
    return { error: "This file is not an AuthorKit scaffold preset." };
  }
  const parsed = ScaffoldExport.safeParse(data);
  if (!parsed.success) return { error: `Preset file is invalid. ${firstMessage(parsed.error)}` };
  const checked = checkTree(parsed.data.template.tree);
  if ("error" in checked) return { error: `Preset file is invalid. ${checked.error}` };

  const id = await availableTemplateId(parsed.data.template.name);
  try {
    await saveScaffoldTemplate({
      ...parsed.data.template,
      id,
      builtIn: false,
      tree: cloneWithNewIds(checked.tree),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { error: `Preset file is invalid. ${firstMessage(err)}` };
    throw err;
  }
  redirect(`/templates/scaffolds/${id}`);
}
