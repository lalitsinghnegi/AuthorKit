import {
  CSS_TEMPLATE_IDS,
  type CssTemplateId,
  type FolderNode,
  type ScaffoldTree,
  type TreeNode,
} from "@/lib/model";
import { nodePath } from "./tree";

export type TreeIssue = { nodeId: string; severity: "error" | "warning"; message: string };

const MAX_NAME = 100;
const MAX_PATH = 200;
const ALLOWED = /^[A-Za-z0-9._-]+$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Check one name against the rules that keep the zip extractable on every OS.
 * Returns an error message or null. `siblings` excludes the node itself.
 */
export function validateName(name: string, siblings: readonly TreeNode[] = []): string | null {
  if (name.length === 0) return "Name is required";
  if (name.length > MAX_NAME) return `Name must be ${MAX_NAME} characters or fewer`;
  if (name === "." || name === "..") return `"${name}" is not allowed`;
  if (!ALLOWED.test(name)) {
    const bad = [...new Set(name.replace(/[A-Za-z0-9._-]/g, ""))]
      .map((c) => (c === " " ? "space" : `"${c}"`))
      .join(", ");
    return `Not allowed: ${bad}. Use letters, digits, dot, underscore or hyphen`;
  }
  if (name.endsWith(".")) return "Name cannot end with a dot";
  if (WINDOWS_RESERVED.test(name)) return `"${name}" is a reserved name on Windows`;
  if (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    return `"${name}" already exists in this folder`;
  }
  return null;
}

export function validateTree(tree: ScaffoldTree): TreeIssue[] {
  const issues: TreeIssue[] = [];
  const templateUse = new Map<string, string[]>();

  const visit = (node: TreeNode, parent: FolderNode | null) => {
    // Compare with earlier siblings only, so a duplicate is reported once, on the later node.
    const earlier = parent ? parent.children.slice(0, parent.children.indexOf(node)) : [];
    const nameError = validateName(node.name, earlier);
    if (nameError) issues.push({ nodeId: node.id, severity: "error", message: nameError });

    const path = nodePath(tree, node.id);
    if (path.length > MAX_PATH) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: `Path is longer than ${MAX_PATH} characters`,
      });
    }

    if (node.type === "file") {
      if (node.cssTemplateId) {
        if (!node.name.toLowerCase().endsWith(".css")) {
          issues.push({
            nodeId: node.id,
            severity: "error",
            message: "Files with a CSS template must end in .css",
          });
        }
        templateUse.set(node.cssTemplateId, [
          ...(templateUse.get(node.cssTemplateId) ?? []),
          node.id,
        ]);
      } else if (node.name.toLowerCase().endsWith(".css")) {
        issues.push({
          nodeId: node.id,
          severity: "warning",
          message: "No CSS template assigned; this file will be empty",
        });
      }
      return;
    }

    if (node.children.length === 0) {
      issues.push({ nodeId: node.id, severity: "warning", message: "Empty folder" });
    }
    node.children.forEach((child) => visit(child, node));
  };
  visit(tree, null);

  for (const [templateId, ids] of templateUse) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      issues.push({
        nodeId: id,
        severity: "warning",
        message: `The "${templateId}" template is assigned to ${ids.length} files; they will be identical`,
      });
    }
  }
  return issues;
}

export const treeHasErrors = (issues: TreeIssue[]) => issues.some((i) => i.severity === "error");

/** Templates that no file in the tree uses. */
export function unusedTemplates(tree: ScaffoldTree): CssTemplateId[] {
  const used = new Set<string>();
  const visit = (node: TreeNode) => {
    if (node.type === "file" && node.cssTemplateId) used.add(node.cssTemplateId);
    if (node.type === "folder") node.children.forEach(visit);
  };
  visit(tree);
  return CSS_TEMPLATE_IDS.filter((id) => !used.has(id));
}
