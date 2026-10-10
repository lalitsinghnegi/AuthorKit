"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin, checkSignedIn } from "@/lib/auth/session";
import type { FigmaClient } from "@/lib/figma/client";
import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import type { FigmaNode } from "@/lib/figma/types";
import {
  MAPPABLE_COMPONENTS,
  candidateFrames,
  confirmFromPatterns,
  effectivePatterns,
  mergeMappings,
  safeImages,
  type MappableComponent,
} from "@/lib/mapping";
import type { FigmaLink, FrameMapping } from "@/lib/model";
import { FIGMA_BUDGET, spend } from "@/lib/security/rateLimit";
import { getProject, updateProject } from "@/lib/storage/projects";
import { getComponentPatterns } from "@/lib/storage/settings";

export type MappingResult =
  { ok: true; links: FigmaLink[]; notes: string[] } | { ok: false; error: string };

const friendly = (err: unknown): string | null => (err instanceof FigmaError ? err.message : null);

/** Fetch each linked node once per file. Links without a frame are reported in `notes`. */
async function fetchRoots(
  client: FigmaClient,
  links: FigmaLink[],
  notes: string[],
): Promise<Map<string, FigmaNode>> {
  const roots = new Map<string, FigmaNode>();
  const byFile = new Map<string, FigmaLink[]>();
  for (const link of links) {
    if (!link.nodeId) {
      notes.push(
        `“${link.label}” links to a whole file. Select a frame in Figma and copy its link to detect components.`,
      );
      continue;
    }
    byFile.set(link.fileKey, [...(byFile.get(link.fileKey) ?? []), link]);
  }
  for (const [fileKey, fileLinks] of byFile) {
    const res = await client.getNodes(fileKey, [...new Set(fileLinks.map((l) => l.nodeId!))]);
    for (const link of fileLinks) {
      const node = res.nodes[link.nodeId!];
      if (node) roots.set(link.id, node.document);
      else notes.push(`The frame for “${link.label}” was not found in Figma; check the link.`);
    }
  }
  return roots;
}

/** Find the frames in every linked node and confirm those whose names clearly name a component. */
export async function detectFramesAction(projectId: string): Promise<MappingResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const overBudget = spend(FIGMA_BUDGET, auth.user.id);
  if (overBudget) return { ok: false, error: overBudget };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  if (project.figmaLinks.length === 0)
    return { ok: false, error: "Add Figma links first (Figma)." };

  const notes: string[] = [];
  try {
    const client = await getFigmaClient();
    const roots = await fetchRoots(client, project.figmaLinks, notes);
    const patterns = effectivePatterns(await getComponentPatterns());

    const updated = await updateProject(projectId, (p) => ({
      ...p,
      figmaLinks: p.figmaLinks.map((link) => {
        const root = roots.get(link.id);
        if (!root) return link;
        const frames = candidateFrames(root);
        const detected = confirmFromPatterns(frames, patterns).filter(
          (m) => m.nodeId !== link.nodeId,
        );
        // A component link already says what its own frame is.
        const own = frames.find((f) => f.nodeId === link.nodeId);
        if (own && link.scope === "component" && link.componentId)
          detected.push({
            ...own,
            componentId: link.componentId,
            source: "manual",
            reason: "Set on the Figma link",
          });
        return { ...link, mappings: mergeMappings(link.mappings ?? [], frames, detected) };
      }),
    }));
    await audit(actorOf(auth.user), {
      action: "mapping.detect",
      target: { type: "project", id: project.id, name: project.name },
      details: `${roots.size} linked frames`,
    });
    return { ok: true, links: updated.figmaLinks, notes };
  } catch (err) {
    const message = friendly(err);
    if (message) return { ok: false, error: message };
    throw err;
  }
}

export type PreviewResult =
  { ok: true; images: Record<string, string> } | { ok: false; error: string };

/**
 * Render PNG previews of mapped frames. Figma's image links expire, so they are
 * returned to the browser and never stored. Only allowed image hosts pass.
 */
export async function loadPreviewsAction(projectId: string): Promise<PreviewResult> {
  const auth = await checkSignedIn();
  if (!auth.user) return { ok: false, error: auth.denied };
  const overBudget = spend(FIGMA_BUDGET, auth.user.id);
  if (overBudget) return { ok: false, error: overBudget };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  try {
    const client = await getFigmaClient();
    const images: Record<string, string> = {};
    const byFile = new Map<string, Set<string>>();
    for (const link of project.figmaLinks) {
      for (const m of link.mappings ?? []) {
        if (m.missing) continue;
        byFile.set(link.fileKey, (byFile.get(link.fileKey) ?? new Set()).add(m.nodeId));
      }
    }
    for (const [fileKey, ids] of byFile) {
      const all = [...ids];
      for (let i = 0; i < all.length; i += 50) {
        const res = await client.getImages(fileKey, all.slice(i, i + 50), {
          format: "png",
          scale: 0.5,
        });
        Object.assign(images, safeImages(res.images));
      }
    }
    return { ok: true, images };
  } catch (err) {
    const message = friendly(err);
    if (message) return { ok: false, error: message };
    throw err;
  }
}

export type MappingEdit = {
  linkId: string;
  nodeId: string;
  /** null removes the frame from the mapping. */
  componentId: MappableComponent | null;
};

/**
 * Apply the admin's changes: a new component for a frame, or null to remove
 * it. Only existing frames can change. A component link's own frame keeps the
 * link's componentId in sync.
 */
export async function saveMappingsAction(
  projectId: string,
  edits: MappingEdit[],
): Promise<MappingResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };

  const byKey = new Map(edits.map((e) => [`${e.linkId} ${e.nodeId}`, e]));
  for (const e of edits) {
    if (e.componentId !== null && !MAPPABLE_COMPONENTS.includes(e.componentId))
      return { ok: false, error: `Unknown component “${e.componentId}”.` };
    const link = project.figmaLinks.find((l) => l.id === e.linkId);
    if (!link?.mappings?.some((m) => m.nodeId === e.nodeId))
      return { ok: false, error: "A frame was not found. Detect frames again." };
  }

  const updated = await updateProject(projectId, (p) => ({
    ...p,
    figmaLinks: p.figmaLinks.map((link) => {
      const mappings = link.mappings?.flatMap((m): FrameMapping[] => {
        const e = byKey.get(`${link.id} ${m.nodeId}`);
        if (!e || e.componentId === m.componentId) return [m];
        if (e.componentId === null) return [];
        return [{ ...m, componentId: e.componentId, source: "manual", reason: undefined }];
      });
      const own = mappings?.find((m) => m.nodeId === link.nodeId);
      const componentId = link.scope === "component" && own ? own.componentId : link.componentId;
      return { ...link, mappings, componentId };
    }),
  }));
  await audit(actorOf(auth.user), {
    action: "mapping.save",
    target: { type: "project", id: project.id, name: project.name },
    details: `${edits.length} frames`,
  });
  return { ok: true, links: updated.figmaLinks, notes: [] };
}
