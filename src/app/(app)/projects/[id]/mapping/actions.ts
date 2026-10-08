"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin, checkSignedIn } from "@/lib/auth/session";
import type { FigmaClient } from "@/lib/figma/client";
import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import type { FigmaNode } from "@/lib/figma/types";
import { LLMError, MAX_FRAMES, type MappingRequest } from "@/lib/llm/provider";
import { getLLMProvider } from "@/lib/llm/server";
import {
  MAPPABLE_COMPONENTS,
  candidateFrames,
  effectivePatterns,
  isAmbiguous,
  mergeMappings,
  safeImages,
  suggestFromPatterns,
  type CandidateFrame,
  type MappableComponent,
} from "@/lib/mapping";
import { CSS_TEMPLATE_LABELS, type FigmaLink, type FrameMapping, type Project } from "@/lib/model";
import { getProject, updateProject } from "@/lib/storage/projects";
import { getComponentPatterns } from "@/lib/storage/settings";
import { getManifests } from "@/lib/templates/registry";

export type MappingResult =
  { ok: true; links: FigmaLink[]; notes: string[] } | { ok: false; error: string };

const friendly = (err: unknown): string | null =>
  err instanceof FigmaError || err instanceof LLMError ? err.message : null;

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

/** Find candidate frames in every linked node and suggest components from their names. */
export async function detectFramesAction(projectId: string): Promise<MappingResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
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
        const detected = suggestFromPatterns(candidateFrames(root), patterns).map((m) =>
          // A component link already says what its frame is.
          m.nodeId === link.nodeId && link.scope === "component" && link.componentId
            ? {
                ...m,
                componentId: link.componentId,
                state: "confirmed" as const,
                source: "manual" as const,
                confidence: "high" as const,
                reason: "Set on the Figma link",
              }
            : m,
        );
        return { ...link, mappings: mergeMappings(link.mappings ?? [], detected) };
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
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  try {
    const client = await getFigmaClient();
    const images: Record<string, string> = {};
    const byFile = new Map<string, Set<string>>();
    for (const link of project.figmaLinks) {
      for (const m of link.mappings ?? []) {
        if (m.missing || m.state === "ignored") continue;
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

export type AiResult =
  | { ok: true; links: FigmaLink[]; suggested: number; notes: string[] }
  | { ok: false; error: string };

/** Ask the AI provider about frames whose names did not settle the mapping. Results stay suggestions. */
export async function suggestWithAIAction(projectId: string): Promise<AiResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const provider = getLLMProvider();
  if (!provider)
    return {
      ok: false,
      error: "AI suggestions are off. Set ANTHROPIC_API_KEY in .env to switch them on.",
    };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };

  const ambiguous = project.figmaLinks.filter((l) => (l.mappings ?? []).some(isAmbiguous));
  if (ambiguous.length === 0)
    return {
      ok: true,
      links: project.figmaLinks,
      suggested: 0,
      notes: ["No ambiguous frames to ask about."],
    };

  const notes: string[] = [];
  try {
    // Re-read the nodes for child names and sizes, which are not stored.
    const roots = await fetchRoots(await getFigmaClient(), ambiguous, notes);
    const frames: CandidateFrame[] = [];
    for (const link of ambiguous) {
      const wanted = new Set((link.mappings ?? []).filter(isAmbiguous).map((m) => m.nodeId));
      const root = roots.get(link.id);
      if (root) frames.push(...candidateFrames(root).filter((f) => wanted.has(f.nodeId)));
    }
    if (frames.length > MAX_FRAMES)
      notes.push(`Only the first ${MAX_FRAMES} ambiguous frames were sent.`);
    const request: MappingRequest = {
      frames: frames
        .slice(0, MAX_FRAMES)
        .map(({ nodeId, nodeName, path, childNames, width, height }) => ({
          nodeId,
          nodeName,
          path,
          childNames,
          width,
          height,
        })),
      components: componentDescriptions(),
    };
    const suggestions = new Map(
      (await provider.suggestMappings(request)).map((s) => [s.nodeId, s]),
    );

    const updated = await updateProject(projectId, (p) => applySuggestions(p, suggestions));
    await audit(actorOf(auth.user), {
      action: "mapping.ai_suggest",
      target: { type: "project", id: project.id, name: project.name },
      details: `${suggestions.size} frames sent to ${provider.name}`,
    });
    return { ok: true, links: updated.figmaLinks, suggested: suggestions.size, notes };
  } catch (err) {
    const message = friendly(err);
    if (message) return { ok: false, error: message };
    throw err;
  }
}

function componentDescriptions(): MappingRequest["components"] {
  const manifests = getManifests();
  return MAPPABLE_COMPONENTS.map((id) => ({
    id,
    name: CSS_TEMPLATE_LABELS[id],
    description: manifests[id].description,
  }));
}

function applySuggestions(
  project: Project,
  suggestions: Map<
    string,
    { componentId: MappableComponent | null; confidence: "high" | "low"; reason: string }
  >,
): Project {
  return {
    ...project,
    figmaLinks: project.figmaLinks.map((link) => ({
      ...link,
      mappings: link.mappings?.map((m) => {
        const s = suggestions.get(m.nodeId);
        if (!s || !isAmbiguous(m)) return m;
        return {
          ...m,
          componentId: s.componentId,
          confidence: s.confidence,
          reason: s.reason,
          source: "ai" as const,
          state: "suggested" as const,
        };
      }),
    })),
  };
}

export type MappingEdit = {
  linkId: string;
  nodeId: string;
  componentId: MappableComponent | null;
  state: FrameMapping["state"];
};

/**
 * Apply the admin's decisions. Only existing frames can change; a confirmed
 * frame must name a component. A component link's own frame keeps the link's
 * componentId in sync.
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
    if (!["suggested", "confirmed", "ignored"].includes(e.state))
      return { ok: false, error: "Unknown state." };
    if (e.state === "confirmed" && e.componentId === null)
      return { ok: false, error: "Choose a component before confirming a frame, or ignore it." };
    const link = project.figmaLinks.find((l) => l.id === e.linkId);
    if (!link?.mappings?.some((m) => m.nodeId === e.nodeId))
      return { ok: false, error: "A frame was not found. Detect frames again." };
  }

  const updated = await updateProject(projectId, (p) => ({
    ...p,
    figmaLinks: p.figmaLinks.map((link) => {
      const mappings = link.mappings?.map((m) => {
        const e = byKey.get(`${link.id} ${m.nodeId}`);
        if (!e || (e.componentId === m.componentId && e.state === m.state)) return m;
        const changedComponent = e.componentId !== m.componentId;
        return {
          ...m,
          componentId: e.componentId,
          state: e.state,
          ...(changedComponent
            ? { source: "manual" as const, confidence: undefined, reason: undefined }
            : {}),
        };
      });
      const own = mappings?.find((m) => m.nodeId === link.nodeId);
      const componentId =
        link.scope === "component" && own?.state === "confirmed" && own.componentId
          ? own.componentId
          : link.componentId;
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
