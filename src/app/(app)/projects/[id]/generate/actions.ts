"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { NpmOptions } from "@/lib/model";
import { getProject, updateProject } from "@/lib/storage/projects";

export type OptionsResult = { ok: true } | { ok: false; error: string };

/** Save the npm packaging options; the name and version are checked against npm's rules. */
export async function savePackageOptionsAction(
  projectId: string,
  input: unknown,
): Promise<OptionsResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const parsed = NpmOptions.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `${issue?.path.join(".") === "version" ? "Version" : "Name"}: ${issue?.message ?? "invalid"}`,
    };
  }
  if (!(await getProject(projectId))) return { ok: false, error: "This project no longer exists." };
  await updateProject(projectId, (p) => ({ ...p, npm: parsed.data }));
  await audit(actorOf(auth.user), {
    action: "project.package_options",
    target: { type: "project", id: projectId },
    details: parsed.data.enabled ? `npm ${parsed.data.name}@${parsed.data.version}` : "npm off",
  });
  return { ok: true };
}
