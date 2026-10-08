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
  width?: number;
  height?: number;
  childNames: string[];
};

/** The linked node plus frame-like children and grandchildren, in document order. */
export function candidateFrames(root: FigmaNode): CandidateFrame[] {
  const out: CandidateFrame[] = [];
  const visit = (node: FigmaNode, trail: string[], depth: number) => {
    if (node.visible === false) return;
    const path = [...trail, node.name];
    if (FRAME_TYPES.has(node.type)) {
      out.push({
        nodeId: node.id,
        nodeName: node.name,
        path: path.join(" › "),
        width: node.absoluteBoundingBox?.width,
        height: node.absoluteBoundingBox?.height,
        childNames: (node.children ?? []).slice(0, 12).map((c) => c.name),
      });
    }
    if (depth < MAX_DEPTH) for (const child of node.children ?? []) visit(child, path, depth + 1);
  };
  visit(root, [], 0);
  return out;
}

/** Suggest a component for each candidate from its name. */
export function suggestFromPatterns(
  frames: CandidateFrame[],
  patterns: Record<MappableComponent, string[]>,
): FrameMapping[] {
  return frames.map((f) => {
    const base = {
      nodeId: f.nodeId,
      nodeName: f.nodeName,
      path: f.path,
      state: "suggested" as const,
      source: "pattern" as const,
    };
    const result = classify(f.nodeName, patterns);
    if (result.kind === "match") {
      return {
        ...base,
        componentId: result.componentId,
        confidence: result.score >= 2 ? ("high" as const) : ("low" as const),
        reason: `Name ${result.score === 3 ? "is" : result.score === 2 ? "starts with" : "contains"} “${result.keyword}”`,
      };
    }
    if (result.kind === "ambiguous") {
      return {
        ...base,
        componentId: null,
        confidence: "low" as const,
        reason: `Ambiguous: matches ${result.candidates.map((c) => `${c.componentId} (“${c.keyword}”)`).join(" and ")}`,
      };
    }
    return {
      ...base,
      componentId: null,
      confidence: "low" as const,
      reason: "No name pattern matches",
    };
  });
}

/** A frame that still needs a decision because its name did not settle it. */
export const isAmbiguous = (m: FrameMapping) =>
  m.state === "suggested" && !m.missing && (m.componentId === null || m.confidence === "low");

/**
 * Combine a new detection with saved mappings. Confirmed and ignored frames
 * keep the admin's decision (names and paths refresh); new frames are added
 * as suggestions; saved frames no longer found are kept and marked missing.
 */
export function mergeMappings(
  saved: readonly FrameMapping[],
  detected: readonly FrameMapping[],
): FrameMapping[] {
  const byId = new Map(saved.map((m) => [m.nodeId, m]));
  const seen = new Set<string>();
  const out: FrameMapping[] = detected.map((d) => {
    seen.add(d.nodeId);
    const old = byId.get(d.nodeId);
    if (old && old.state !== "suggested")
      return { ...old, nodeName: d.nodeName, path: d.path, missing: undefined };
    // Keep an AI suggestion over a pattern miss for the same frame.
    if (old?.source === "ai" && d.componentId === null)
      return { ...old, nodeName: d.nodeName, path: d.path, missing: undefined };
    return d;
  });
  for (const old of saved) if (!seen.has(old.nodeId)) out.push({ ...old, missing: true });
  return out;
}
