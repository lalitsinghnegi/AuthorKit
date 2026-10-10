import { z } from "zod";
import { CssTemplateId } from "./cssTemplate";
import { BreakpointSet } from "./breakpoints";
import { Id, SchemaVersion } from "./common";

// Basic safe-name rule; the scaffold designer (Prompt 4) adds friendlier validation.
export const NodeName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, underscore or hyphen")
  .refine((n) => n !== "." && n !== "..", "Name cannot be '.' or '..'");

export const FileNode = z.object({
  id: Id,
  type: z.literal("file"),
  name: NodeName,
  cssTemplateId: CssTemplateId.nullable(),
});
export type FileNode = z.infer<typeof FileNode>;

export type FolderNode = {
  id: string;
  type: "folder";
  name: string;
  children: (FolderNode | FileNode)[];
};
export type TreeNode = FolderNode | FileNode;

export const FolderNode: z.ZodType<FolderNode> = z.lazy(() =>
  z
    .object({
      id: Id,
      type: z.literal("folder"),
      name: NodeName,
      children: z.array(z.union([FolderNode, FileNode])),
    })
    .superRefine((folder, ctx) => {
      // Case-insensitive: macOS and Windows file systems are.
      const seen = new Set<string>();
      for (const child of folder.children) {
        const key = child.name.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate name "${child.name}" in folder "${folder.name}"`,
          });
        }
        seen.add(key);
      }
    }),
);

export const MAX_TREE_DEPTH = 32;
export const MAX_TREE_NODES = 2000;

/**
 * Size check that runs before the recursive schema, without recursion, so a
 * deeply nested upload is refused instead of overflowing the stack.
 */
export function treeShapeProblem(input: unknown): string | null {
  const stack: { node: unknown; depth: number }[] = [{ node: input, depth: 1 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > MAX_TREE_NODES)
      return `The scaffold has more than ${MAX_TREE_NODES} files and folders`;
    if (depth > MAX_TREE_DEPTH)
      return `The scaffold is nested more than ${MAX_TREE_DEPTH} levels deep`;
    const children = (node as { children?: unknown } | null)?.children;
    if (Array.isArray(children))
      for (const child of children) stack.push({ node: child, depth: depth + 1 });
  }
  return null;
}

/** The root folder stands for the package root; its name becomes the zip's top folder. */
export const ScaffoldTree: z.ZodType<FolderNode> = z.preprocess((input, ctx) => {
  const problem = treeShapeProblem(input);
  if (!problem) return input;
  ctx.addIssue({ code: "custom", message: problem, input });
  return z.NEVER;
}, FolderNode) as z.ZodType<FolderNode>;
export type ScaffoldTree = FolderNode;

export function* walkTree(node: TreeNode): Generator<TreeNode> {
  yield node;
  if (node.type === "folder") for (const child of node.children) yield* walkTree(child);
}

/** Node ids must be unique across the whole tree. */
export function treeIdsAreUnique(tree: ScaffoldTree): boolean {
  const ids = [...walkTree(tree)].map((n) => n.id);
  return new Set(ids).size === ids.length;
}

/** The standard set, with stable ids; templates saved before breakpoints existed get it. */
export const STANDARD_TEMPLATE_BREAKPOINTS: BreakpointSet = {
  breakpoints: [
    { id: "mobile", name: "mobile", maxWidth: 767 },
    { id: "tablet", name: "tablet", minWidth: 768, maxWidth: 985 },
    { id: "desktop", name: "desktop", minWidth: 986 },
  ],
};

export const ScaffoldTemplate = z.object({
  schemaVersion: SchemaVersion,
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  builtIn: z.boolean(),
  tree: ScaffoldTree.refine(treeIdsAreUnique, "Node ids must be unique"),
  /** Breakpoints a project can take from this template (new projects start with them). */
  breakpoints: z.preprocess(
    (value) => value ?? structuredClone(STANDARD_TEMPLATE_BREAKPOINTS),
    BreakpointSet,
  ),
});
export type ScaffoldTemplate = z.infer<typeof ScaffoldTemplate>;

/** Portable file for sharing a scaffold preset. */
export const ScaffoldExport = z.object({
  schemaVersion: SchemaVersion,
  kind: z.literal("authorkit-scaffold"),
  template: ScaffoldTemplate,
});
export type ScaffoldExport = z.infer<typeof ScaffoldExport>;
