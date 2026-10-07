"use server";

import { z } from "zod";
import { hasErrors, validateBreakpoints } from "@/lib/breakpoints";
import { BreakpointSet, ProjectInput } from "@/lib/model";
import { updateProject } from "@/lib/storage/projects";

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
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid breakpoints" };
  }
  const issues = validateBreakpoints(parsed.data.breakpoints.breakpoints);
  if (hasErrors(issues)) {
    return { ok: false, error: issues.find((i) => i.severity === "error")!.message };
  }
  try {
    const project = await updateProject(projectId, (p) => ({
      ...p,
      approach: parsed.data.approach,
      breakpoints: parsed.data.breakpoints,
    }));
    return { ok: true, savedAt: project.updatedAt };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid" };
    if (err instanceof Error && err.message.startsWith("Project not found")) {
      return { ok: false, error: "This project no longer exists." };
    }
    throw err;
  }
}
