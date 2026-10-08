"use server";

import { randomUUID } from "node:crypto";
import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import type { FigmaNode, FigmaStyleMeta, FigmaVariablesResponse } from "@/lib/figma/types";
import { TokenFile, type DesignToken } from "@/lib/model";
import {
  TOKEN_NAME,
  extractTokens,
  mergeTokens,
  validateTokenValue,
  withName,
  type ExtractInput,
  type MergeSummary,
} from "@/lib/tokens";
import { getProject, getTokens, saveTokens } from "@/lib/storage/projects";

export type ExtractResult =
  | { ok: true; tokens: DesignToken[]; summary: MergeSummary; notes: string[] }
  | { ok: false; error: string };

/**
 * Read the linked global and component frames from Figma, extract tokens,
 * merge them with the saved ones (keeping the admin's decisions) and save.
 */
export async function extractTokensAction(projectId: string): Promise<ExtractResult> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  const links = project.figmaLinks.filter((l) => l.scope === "global" || l.scope === "component");
  if (links.length === 0) {
    return {
      ok: false,
      error: "Add a Figma link for global styles or a component first (Figma links).",
    };
  }

  const notes: string[] = [];
  try {
    const client = await getFigmaClient();
    const byFile = new Map<string, typeof links>();
    for (const link of links) byFile.set(link.fileKey, [...(byFile.get(link.fileKey) ?? []), link]);

    let variablesUnavailable = false;
    const inputs: ExtractInput[] = [];
    for (const [fileKey, fileLinks] of byFile) {
      let roots: FigmaNode[];
      let styles: Record<string, FigmaStyleMeta>;
      if (fileLinks.some((l) => !l.nodeId)) {
        const file = await client.getFile(fileKey);
        roots = [file.document];
        styles = file.styles;
      } else {
        const ids = [...new Set(fileLinks.map((l) => l.nodeId!))];
        const res = await client.getNodes(fileKey, ids);
        roots = [];
        styles = {};
        for (const link of fileLinks) {
          const node = res.nodes[link.nodeId!];
          if (!node)
            notes.push(`The frame for "${link.label}" was not found in Figma; check the link.`);
          else if (!roots.some((r) => r.id === node.document.id)) {
            roots.push(node.document);
            Object.assign(styles, node.styles ?? {});
          }
        }
      }

      let variables: FigmaVariablesResponse["meta"] | undefined;
      try {
        variables = (await client.getLocalVariables(fileKey)).meta;
      } catch (err) {
        if (!(err instanceof FigmaError) || !["plan_limit", "no_access"].includes(err.code))
          throw err;
        variablesUnavailable = true;
      }
      inputs.push({ fileKey, roots, styles, variables });
    }
    if (variablesUnavailable)
      notes.push(
        "Figma variables are not available for this account, so styles and layers were used.",
      );

    const extracted = extractTokens(inputs);
    notes.push(...extracted.notes);
    const merged = mergeTokens(await getTokens(projectId), extracted.tokens, randomUUID);
    await saveTokens(projectId, merged.tokens);
    return { ok: true, tokens: merged.tokens, summary: merged.summary, notes };
  } catch (err) {
    if (err instanceof FigmaError) return { ok: false, error: err.message };
    throw err;
  }
}

/** The fields the review screen may change on each token. */
export type TokenEdit = Pick<DesignToken, "id" | "name" | "value" | "status">;
export type SaveTokensResult = { ok: true; tokens: DesignToken[] } | { ok: false; error: string };

/**
 * Apply the review screen's edits to the saved tokens. Only name, value and
 * status change; everything else comes from the saved file. Tokens missing
 * from `edits` are deleted.
 */
export async function saveTokensAction(
  projectId: string,
  edits: TokenEdit[],
): Promise<SaveTokensResult> {
  if (!(await getProject(projectId))) return { ok: false, error: "This project no longer exists." };
  const saved = await getTokens(projectId);
  const byId = new Map(edits.map((e) => [e.id, e]));

  const next: DesignToken[] = [];
  for (const token of saved) {
    const edit = byId.get(token.id);
    if (!edit) continue;
    const name = String(edit.name ?? "").trim();
    const value = String(edit.value ?? "").trim();
    if (!TOKEN_NAME.test(name))
      return { ok: false, error: `"${name}" is not a valid token name (lowercase kebab-case).` };
    const valueError = validateTokenValue(token.type, value);
    if (valueError) return { ok: false, error: `${name}: ${valueError}` };
    if (!["auto", "accepted", "overridden", "excluded"].includes(edit.status)) {
      return { ok: false, error: `${name}: unknown status` };
    }
    // A value that differs from Figma is an override, whatever the client said.
    const status =
      edit.status === "excluded"
        ? "excluded"
        : value !== token.originalValue
          ? "overridden"
          : edit.status === "overridden"
            ? "accepted"
            : edit.status;
    next.push({ ...token, name, value, status, meta: token.meta && withName(name, token.meta) });
  }

  const file = TokenFile.safeParse({ schemaVersion: 1, tokens: next });
  if (!file.success) return { ok: false, error: file.error.issues[0]?.message ?? "Invalid tokens" };
  await saveTokens(projectId, next);
  return { ok: true, tokens: next };
}
