import { shortName } from "@/lib/figma/names";
import type { FigmaNode } from "@/lib/figma/types";
import type { FrameMapping } from "@/lib/model";
import { classify, type MappableComponent } from "./patterns";

/** Node types that can stand for a component in a design. */
const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
const MAX_DEPTH = 2;

export type CandidateFrame = {
  nodeId: string;
  nodeName: string;
  path: string;
};

/** The linked node plus frame-like children and grandchildren, in document order. */
export function candidateFrames(root: FigmaNode): CandidateFrame[] {
  const out: CandidateFrame[] = [];
  const visit = (node: FigmaNode, trail: string[], depth: number) => {
    if (node.visible === false) return;
    const name = shortName(node.name);
    const path = [...trail, name];
    if (FRAME_TYPES.has(node.type)) {
      out.push({
        nodeId: node.id,
        nodeName: name,
        path: path.join(" › "),
      });
    }
    if (depth < MAX_DEPTH) for (const child of node.children ?? []) visit(child, path, depth + 1);
  };
  visit(root, [], 0);
  return out;
}

/**
 * Confirm the candidates whose name clearly names one component: the name is,
 * or starts with, a keyword. Ambiguous, weak and unmatched frames are left out.
 */
export function confirmFromPatterns(
  frames: CandidateFrame[],
  patterns: Record<MappableComponent, string[]>,
): FrameMapping[] {
  return frames.flatMap((f) => {
    const result = classify(f.nodeName, patterns);
    if (result.kind !== "match" || result.score < 2) return [];
    return [
      {
        nodeId: f.nodeId,
        nodeName: f.nodeName,
        path: f.path,
        componentId: result.componentId,
        source: "pattern" as const,
        reason: `Name ${result.score === 3 ? "is" : "starts with"} “${result.keyword}”`,
      },
    ];
  });
}

/**
 * Combine a new detection with saved mappings, in document order. Saved frames
 * keep the admin's component (names and paths refresh); newly confirmed frames
 * are added; saved frames no longer in `frames` are kept and marked missing.
 */
export function mergeMappings(
  saved: readonly FrameMapping[],
  frames: readonly CandidateFrame[],
  detected: readonly FrameMapping[],
): FrameMapping[] {
  const savedById = new Map(saved.map((m) => [m.nodeId, m]));
  const detectedById = new Map(detected.map((m) => [m.nodeId, m]));
  const out: FrameMapping[] = frames.flatMap((f) => {
    const old = savedById.get(f.nodeId);
    if (old) return [{ ...old, nodeName: f.nodeName, path: f.path, missing: undefined }];
    const d = detectedById.get(f.nodeId);
    return d ? [d] : [];
  });
  const present = new Set(frames.map((f) => f.nodeId));
  for (const old of saved) if (!present.has(old.nodeId)) out.push({ ...old, missing: true });
  return out;
}
