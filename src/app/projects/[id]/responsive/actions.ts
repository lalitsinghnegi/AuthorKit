"use server";

import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import type { FigmaStyleMeta } from "@/lib/figma/types";
import type { ResponsiveFile } from "@/lib/model";
import { collectFrameRefs, computeResponsive, type SourceFrame } from "@/lib/responsive";
import { getProject, saveResponsive } from "@/lib/storage/projects";

export type ResponsiveResult =
  { ok: true; data: ResponsiveFile; notes: string[] } | { ok: false; error: string };

/** Read every confirmed frame from Figma, compute per-breakpoint values and save them. */
export async function extractResponsiveAction(projectId: string): Promise<ResponsiveResult> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  const refs = collectFrameRefs(project);
  if (refs.length === 0) {
    return {
      ok: false,
      error: "No confirmed component frames yet. Confirm frames under Components first.",
    };
  }

  const notes: string[] = [];
  try {
    const client = await getFigmaClient();
    const frames: SourceFrame[] = [];
    const styles: Record<string, FigmaStyleMeta> = {};
    const byFile = new Map<string, typeof refs>();
    for (const ref of refs) byFile.set(ref.fileKey, [...(byFile.get(ref.fileKey) ?? []), ref]);

    for (const [fileKey, fileRefs] of byFile) {
      const ids = [...new Set(fileRefs.map((r) => r.nodeId))];
      for (let i = 0; i < ids.length; i += 100) {
        const res = await client.getNodes(fileKey, ids.slice(i, i + 100));
        for (const ref of fileRefs) {
          const node = res.nodes[ref.nodeId];
          if (!ids.slice(i, i + 100).includes(ref.nodeId)) continue;
          if (!node) {
            notes.push(`Frame ${ref.nodeId} was not found in Figma; detect frames again.`);
            continue;
          }
          Object.assign(styles, node.styles ?? {});
          frames.push({
            target: ref.target,
            linkId: ref.linkId,
            node: node.document,
            breakpointId: ref.breakpointId,
          });
        }
      }
    }

    const data = computeResponsive({
      breakpoints: project.breakpoints.breakpoints,
      approach: project.approach,
      frames,
      styles,
    });
    await saveResponsive(projectId, data);
    return { ok: true, data, notes };
  } catch (err) {
    if (err instanceof FigmaError) return { ok: false, error: err.message };
    throw err;
  }
}
