import type { CssTemplateId, Project } from "@/lib/model";

/** A confirmed frame to read: which link, which node, and what it feeds. */
export type FrameRef = {
  target: CssTemplateId | "typography";
  linkId: string;
  fileKey: string;
  nodeId: string;
  breakpointId?: string;
};

/**
 * Every confirmed mapping becomes a source. Frames mapped to "global" feed the
 * typography tokens. A component link's own frame counts even before frames
 * are detected, because the link already says what it is.
 */
export function collectFrameRefs(project: Project): FrameRef[] {
  const refs: FrameRef[] = [];
  for (const link of project.figmaLinks) {
    const confirmed = (link.mappings ?? []).filter((m) => !m.missing);
    for (const m of confirmed) {
      refs.push({
        target: m.componentId === "global" ? "typography" : m.componentId,
        linkId: link.id,
        fileKey: link.fileKey,
        nodeId: m.nodeId,
        breakpointId: link.breakpointId,
      });
    }
    const ownCovered = confirmed.some((m) => m.nodeId === link.nodeId);
    if (
      link.scope === "component" &&
      link.componentId &&
      link.nodeId &&
      !ownCovered &&
      link.componentId !== "tokens"
    ) {
      refs.push({
        target: link.componentId === "global" ? "typography" : link.componentId,
        linkId: link.id,
        fileKey: link.fileKey,
        nodeId: link.nodeId,
        breakpointId: link.breakpointId,
      });
    }
  }
  return refs;
}
