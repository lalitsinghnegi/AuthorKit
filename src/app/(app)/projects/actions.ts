"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin, requireAdmin } from "@/lib/auth/session";
import { ProjectInput } from "@/lib/model";
import { createProject, deleteProject, importProject } from "@/lib/storage/projects";

export type FormState = {
  errors?: Partial<Record<keyof ProjectInput | "form", string[]>>;
  values?: Record<string, string>;
};

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await checkAdmin();
  if (!auth.user) return { errors: { form: [auth.denied] } };
  const values = {
    name: String(formData.get("name") ?? ""),
    brandName: String(formData.get("brandName") ?? ""),
    prefix: String(formData.get("prefix") ?? "").trim(),
    description: String(formData.get("description") ?? ""),
    approach: String(formData.get("approach") ?? ""),
  };
  const parsed = ProjectInput.safeParse({
    ...values,
    description: values.description.trim() || undefined,
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const project = await createProject(parsed.data);
  await audit(actorOf(auth.user), {
    action: "project.create",
    target: { type: "project", id: project.id, name: project.name },
  });
  redirect(`/projects/${project.id}`);
}

export type ImportState = { error?: string };

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function importProjectAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const auth = await checkAdmin();
  if (!auth.user) return { error: auth.denied };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a project.json file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "File is larger than 2 MB." };

  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: "File is not valid JSON." };
  }
  if ((data as { kind?: unknown } | null)?.kind !== "authorkit-project") {
    return { error: "This file is not an AuthorKit project export." };
  }
  let id: string;
  try {
    id = (await importProject(data)).id;
  } catch (err) {
    if (!(err instanceof z.ZodError)) throw err;
    const issue = err.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { error: `Project file is invalid. ${where}${issue?.message ?? ""}`.trim() };
  }
  await audit(actorOf(auth.user), { action: "project.import", target: { type: "project", id } });
  redirect(`/projects/${id}`);
}

export async function deleteProjectAction(id: string): Promise<void> {
  const auth = await requireAdmin();
  await deleteProject(id);
  await audit(actorOf(auth), { action: "project.delete", target: { type: "project", id } });
  redirect("/projects");
}
