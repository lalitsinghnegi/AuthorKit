"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import { parseFigmaUrl } from "@/lib/figma/url";
import { CssTemplateId, FigmaLink, Id } from "@/lib/model";
import { getProject, updateProject } from "@/lib/storage/projects";

/** What the link form sends. The file key and node id are always derived on the server. */
const LinkInput = z.object({
  id: Id.optional(),
  label: z.string().trim().min(1, "Label is required").max(120),
  scope: z.enum(["global", "page", "component"]),
  pageName: z.string().trim().max(120).optional(),
  url: z.string().trim().min(1, "Paste a Figma link"),
  breakpointId: Id.optional(),
  componentId: CssTemplateId.optional(),
});
export type LinkInput = z.input<typeof LinkInput>;

export type LinkResult = { ok: true; links: FigmaLink[] } | { ok: false; error: string };

export async function saveFigmaLinkAction(
  projectId: string,
  input: LinkInput,
): Promise<LinkResult> {
  const parsed = LinkInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid link" };
  const data = parsed.data;

  const url = parseFigmaUrl(data.url);
  if (!url.ok) return { ok: false, error: url.error };

  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  if (
    data.breakpointId &&
    !project.breakpoints.breakpoints.some((b) => b.id === data.breakpointId)
  ) {
    return { ok: false, error: "That breakpoint no longer exists. Reload the page." };
  }
  if (data.id && !project.figmaLinks.some((l) => l.id === data.id)) {
    return { ok: false, error: "That link no longer exists. Reload the page." };
  }

  const link = FigmaLink.safeParse({
    id: data.id ?? randomUUID(),
    label: data.label,
    scope: data.scope,
    pageName: data.scope === "page" ? data.pageName || undefined : undefined,
    url: data.url,
    fileKey: url.fileKey,
    nodeId: url.nodeId,
    breakpointId: data.breakpointId,
    componentId: data.scope === "component" ? data.componentId : undefined,
  });
  if (!link.success) return { ok: false, error: link.error.issues[0]?.message ?? "Invalid link" };

  const updated = await updateProject(projectId, (p) => ({
    ...p,
    figmaLinks: data.id
      ? p.figmaLinks.map((l) => (l.id === data.id ? link.data : l))
      : [...p.figmaLinks, link.data],
  }));
  return { ok: true, links: updated.figmaLinks };
}

export async function deleteFigmaLinkAction(
  projectId: string,
  linkId: string,
): Promise<LinkResult> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  const updated = await updateProject(projectId, (p) => ({
    ...p,
    figmaLinks: p.figmaLinks.filter((l) => l.id !== linkId),
  }));
  return { ok: true, links: updated.figmaLinks };
}

export type CheckResult =
  | { ok: true; fileName: string; nodeName?: string; nodeType?: string }
  | { ok: false; error: string };

/** Confirm the saved token can open the file (and frame) before the admin relies on it. */
export async function checkFigmaLinkAction(rawUrl: string): Promise<CheckResult> {
  const url = parseFigmaUrl(String(rawUrl ?? ""));
  if (!url.ok) return { ok: false, error: url.error };
  try {
    const client = await getFigmaClient();
    if (url.nodeId) {
      const res = await client.getNodes(url.fileKey, [url.nodeId]);
      const node = res.nodes[url.nodeId];
      if (!node) return { ok: false, error: new FigmaError("not_found").message };
      return {
        ok: true,
        fileName: res.name,
        nodeName: node.document.name,
        nodeType: node.document.type,
      };
    }
    const file = await client.getFile(url.fileKey, { depth: 1 });
    return { ok: true, fileName: file.name };
  } catch (err) {
    if (err instanceof FigmaError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not check the link. Is the Figma token set up in Settings?" };
  }
}
