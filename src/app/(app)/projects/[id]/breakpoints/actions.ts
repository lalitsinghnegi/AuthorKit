"use server";

import { z } from "zod";
import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { hasErrors, validateBreakpoints } from "@/lib/breakpoints";
import { BreakpointSet, ProjectInput } from "@/lib/model";
import { getProject, updateProject } from "@/lib/storage/projects";

const Payload = z.object({
  approach: ProjectInput.shape.approach,
  breakpoints: BreakpointSet,
});

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Re-validates on the server; the editor's checks are a convenience, not the gate. */
export async function saveBreakpointsAction(
  projectId: string,
  payload: unknown,
): Promise<SaveResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid breakpoints" };
  }
  const issues = validateBreakpoints(parsed.data.breakpoints.breakpoints);
  if (hasErrors(issues)) {
    return { ok: false, error: issues.find((i) => i.severity === "error")!.message };
  }
  const current = await getProject(projectId);
  if (!current) return { ok: false, error: "This project no longer exists." };
  // Figma links point at breakpoints by id; removing one they use would orphan the link.
  const kept = new Set(parsed.data.breakpoints.breakpoints.map((b) => b.id));
  const orphaned = current.figmaLinks.find((l) => l.breakpointId && !kept.has(l.breakpointId));
  if (orphaned) {
    const name = current.breakpoints.breakpoints.find((b) => b.id === orphaned.breakpointId)?.name;
    return {
      ok: false,
      error: `Breakpoint "${name}" is used by the Figma link "${orphaned.label}". Change that link first.`,
    };
  }
  try {
    const project = await updateProject(projectId, (p) => ({
      ...p,
      approach: parsed.data.approach,
      breakpoints: parsed.data.breakpoints,
    }));
    await audit(actorOf(auth.user), {
      action: "breakpoints.save",
      target: { type: "project", id: project.id, name: project.name },
      details: `${parsed.data.breakpoints.breakpoints.length} breakpoints, ${parsed.data.approach}`,
    });
    return { ok: true, savedAt: project.updatedAt };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid" };
    if (err instanceof Error && err.message.startsWith("Project not found")) {
      return { ok: false, error: "This project no longer exists." };
    }
    throw err;
  }
}
