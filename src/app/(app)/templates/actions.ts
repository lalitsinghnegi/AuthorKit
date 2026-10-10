"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ScaffoldSavePayload } from "@/components/ScaffoldEditor/ScaffoldEditor";
import type { SaveResult } from "@/lib/actions/result";
import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin, requireAdmin } from "@/lib/auth/session";
import { hasErrors, validateBreakpoints } from "@/lib/breakpoints";
import { BreakpointSet, STANDARD_TEMPLATE_BREAKPOINTS, ScaffoldExport } from "@/lib/model";
import { cloneWithNewIds, createFolder } from "@/lib/scaffold";
import { checkTree, firstMessage } from "@/lib/scaffold/server";
import {
  availableTemplateId,
  deleteScaffoldTemplate,
  getScaffoldTemplate,
  saveScaffoldTemplate,
} from "@/lib/storage/scaffoldTemplates";

export async function createScaffoldTemplateAction(): Promise<void> {
  const auth = await requireAdmin();
  const id = await availableTemplateId("New preset");
  await saveScaffoldTemplate({
    schemaVersion: 1,
    id,
    name: "New preset",
    builtIn: false,
    tree: createFolder("package", [createFolder("css")]),
    breakpoints: structuredClone(STANDARD_TEMPLATE_BREAKPOINTS),
  });
  await audit(actorOf(auth), { action: "preset.create", target: { type: "preset", id } });
  redirect(`/templates/scaffolds/${id}`);
}

export async function duplicateScaffoldTemplateAction(sourceId: string): Promise<void> {
  const auth = await requireAdmin();
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
    breakpoints: structuredClone(source.breakpoints),
  });
  await audit(actorOf(auth), {
    action: "preset.duplicate",
    target: { type: "preset", id, name },
    details: `from ${sourceId}`,
  });
  redirect(`/templates/scaffolds/${id}`);
}

export async function deleteScaffoldTemplateAction(id: string): Promise<void> {
  const auth = await requireAdmin();
  await deleteScaffoldTemplate(id);
  await audit(actorOf(auth), { action: "preset.delete", target: { type: "preset", id } });
  redirect("/templates");
}

export async function saveScaffoldTemplateAction(
  id: string,
  payload: ScaffoldSavePayload,
): Promise<SaveResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
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
  await audit(actorOf(auth.user), { action: "preset.save", target: { type: "preset", id, name } });
  return { ok: true };
}

/** Save a custom template's breakpoints. Re-validated here; the editor's checks are a convenience. */
export async function saveTemplateBreakpointsAction(
  id: string,
  payload: unknown,
): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const parsed = z.object({ breakpoints: BreakpointSet }).safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid breakpoints" };
  const issues = validateBreakpoints(parsed.data.breakpoints.breakpoints);
  if (hasErrors(issues))
    return { ok: false, error: issues.find((i) => i.severity === "error")!.message };
  const existing = await getScaffoldTemplate(id);
  if (!existing) return { ok: false, error: "This preset no longer exists." };
  if (existing.builtIn)
    return { ok: false, error: "Built-in presets are read-only. Duplicate it to edit." };
  await saveScaffoldTemplate({ ...existing, breakpoints: parsed.data.breakpoints });
  await audit(actorOf(auth.user), {
    action: "preset.breakpoints",
    target: { type: "preset", id, name: existing.name },
    details: `${parsed.data.breakpoints.breakpoints.length} breakpoints`,
  });
  return { ok: true, savedAt: new Date().toISOString() };
}

export type ImportState = { error?: string };
const MAX_IMPORT_BYTES = 1024 * 1024;

export async function importScaffoldTemplateAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const auth = await checkAdmin();
  if (!auth.user) return { error: auth.denied };
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
  const issues = validateBreakpoints(parsed.data.template.breakpoints.breakpoints);
  if (hasErrors(issues))
    return {
      error: `Preset file is invalid. ${issues.find((i) => i.severity === "error")!.message}`,
    };

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
  await audit(actorOf(auth.user), { action: "preset.import", target: { type: "preset", id } });
  redirect(`/templates/scaffolds/${id}`);
}
