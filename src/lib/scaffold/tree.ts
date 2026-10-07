import type { CssTemplateId, FileNode, FolderNode, ScaffoldTree, TreeNode } from "@/lib/model";

/**
 * Immutable scaffold tree operations. Every function returns a new tree and
 * leaves its input untouched, which keeps undo/redo trivial.
 */

export class TreeError extends Error {}

const newId = () => globalThis.crypto.randomUUID();

export const createFolder = (name: string, children: TreeNode[] = []): FolderNode => ({
  id: newId(),
  type: "folder",
  name,
  children,
});

export const createFile = (name: string, cssTemplateId: CssTemplateId | null = null): FileNode => ({
  id: newId(),
  type: "file",
  name,
  cssTemplateId,
});

export type Located = {
  node: TreeNode;
  parent: FolderNode | null;
  index: number;
  ancestors: FolderNode[];
};

export function findNode(tree: ScaffoldTree, id: string): Located | null {
  const visit = (
    node: TreeNode,
    parent: FolderNode | null,
    index: number,
    ancestors: FolderNode[],
  ): Located | null => {
    if (node.id === id) return { node, parent, index, ancestors };
    if (node.type !== "folder") return null;
    for (let i = 0; i < node.children.length; i++) {
      const found = visit(node.children[i], node, i, [...ancestors, node]);
      if (found) return found;
    }
    return null;
  };
  return visit(tree, null, 0, []);
}

function require(tree: ScaffoldTree, id: string): Located {
  const found = findNode(tree, id);
  if (!found) throw new TreeError(`Node not found: ${id}`);
  return found;
}

function requireFolder(tree: ScaffoldTree, id: string): FolderNode {
  const { node } = require(tree, id);
  if (node.type !== "folder") throw new TreeError(`"${node.name}" is not a folder`);
  return node;
}

/** Slash-separated path from the root, e.g. "acme/css/global.css". */
export function nodePath(tree: ScaffoldTree, id: string): string {
  const { node, ancestors } = require(tree, id);
  return [...ancestors.map((a) => a.name), node.name].join("/");
}

/** True when `id` is `ancestorId` itself or anywhere below it. */
export function isWithin(tree: ScaffoldTree, ancestorId: string, id: string): boolean {
  const found = findNode(tree, id);
  if (!found) return false;
  return found.node.id === ancestorId || found.ancestors.some((a) => a.id === ancestorId);
}

/** Return a copy of the tree with one node replaced by `fn(node)`. */
function updateNode(
  tree: ScaffoldTree,
  id: string,
  fn: (node: TreeNode) => TreeNode,
): ScaffoldTree {
  require(tree, id);
  const visit = (node: TreeNode): TreeNode => {
    if (node.id === id) return fn(node);
    if (node.type !== "folder") return node;
    return { ...node, children: node.children.map(visit) };
  };
  return visit(tree) as ScaffoldTree;
}

export function addNode(
  tree: ScaffoldTree,
  parentId: string,
  node: TreeNode,
  index?: number,
): ScaffoldTree {
  requireFolder(tree, parentId);
  if (findNode(tree, node.id)) throw new TreeError(`Duplicate node id: ${node.id}`);
  return updateNode(tree, parentId, (parent) => {
    const children = [...(parent as FolderNode).children];
    children.splice(index ?? children.length, 0, node);
    return { ...(parent as FolderNode), children };
  });
}

export function renameNode(tree: ScaffoldTree, id: string, name: string): ScaffoldTree {
  return updateNode(tree, id, (node) => ({ ...node, name }));
}

export function deleteNode(tree: ScaffoldTree, id: string): ScaffoldTree {
  const { parent } = require(tree, id);
  if (!parent) throw new TreeError("The root folder cannot be deleted");
  return updateNode(tree, parent.id, (p) => ({
    ...(p as FolderNode),
    children: (p as FolderNode).children.filter((c) => c.id !== id),
  }));
}

export function assignTemplate(
  tree: ScaffoldTree,
  id: string,
  cssTemplateId: CssTemplateId | null,
): ScaffoldTree {
  return updateNode(tree, id, (node) => {
    if (node.type !== "file") throw new TreeError(`"${node.name}" is not a file`);
    return { ...node, cssTemplateId };
  });
}

/** Why a move is not allowed, or null when it is. */
export function moveBlocker(tree: ScaffoldTree, id: string, targetFolderId: string): string | null {
  const found = findNode(tree, id);
  if (!found) return "Node not found";
  if (!found.parent) return "The root folder cannot be moved";
  const target = findNode(tree, targetFolderId);
  if (!target || target.node.type !== "folder") return "Target is not a folder";
  if (isWithin(tree, id, targetFolderId)) return "A folder cannot be moved into itself";
  return null;
}

/**
 * Move a node into `targetFolderId` so that it ends up at position `index`
 * among that folder's children (as seen before the move). Omit `index` to append.
 */
export function moveNode(
  tree: ScaffoldTree,
  id: string,
  targetFolderId: string,
  index?: number,
): ScaffoldTree {
  const blocker = moveBlocker(tree, id, targetFolderId);
  if (blocker) throw new TreeError(blocker);
  const { node, parent, index: from } = require(tree, id);
  let to = index ?? requireFolder(tree, targetFolderId).children.length;
  if (parent!.id === targetFolderId && from < to) to -= 1;
  return addNode(deleteNode(tree, id), targetFolderId, node, to);
}

/** Move a node one place up (-1) or down (+1) within its folder. No-op at the ends. */
export function shiftNode(tree: ScaffoldTree, id: string, delta: -1 | 1): ScaffoldTree {
  const { parent, index } = require(tree, id);
  if (!parent) return tree;
  const to = index + delta;
  if (to < 0 || to >= parent.children.length) return tree;
  return moveNode(tree, id, parent.id, delta > 0 ? to + 1 : to);
}

/** Every folder with its path, root first. */
export function listFolders(tree: ScaffoldTree): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  const visit = (node: TreeNode, prefix: string) => {
    if (node.type !== "folder") return;
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    out.push({ id: node.id, path });
    node.children.forEach((c) => visit(c, path));
  };
  visit(tree, "");
  return out;
}

/** A name not yet used in the folder (case-insensitive): "new-folder", "new-folder-2", … */
export function uniqueChildName(folder: FolderNode, base: string): string {
  const taken = new Set(folder.children.map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`.toLowerCase())) n++;
  return `${stem}-${n}${ext}`;
}

/** Deep copy with fresh ids, used when applying or duplicating a preset. */
export function cloneWithNewIds<T extends TreeNode>(node: T): T {
  if (node.type === "file") return { ...node, id: newId() };
  return { ...node, id: newId(), children: node.children.map(cloneWithNewIds) } as T;
}
