import { z } from "zod";
import { CssTemplateId } from "./cssTemplate";
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

/** The root folder stands for the package root; its name becomes the zip's top folder. */
export const ScaffoldTree = FolderNode;
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

export const ScaffoldTemplate = z.object({
  schemaVersion: SchemaVersion,
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  builtIn: z.boolean(),
  tree: ScaffoldTree.refine(treeIdsAreUnique, "Node ids must be unique"),
});
export type ScaffoldTemplate = z.infer<typeof ScaffoldTemplate>;

/** Portable file for sharing a scaffold preset. */
export const ScaffoldExport = z.object({
  schemaVersion: SchemaVersion,
  kind: z.literal("authorkit-scaffold"),
  template: ScaffoldTemplate,
});
export type ScaffoldExport = z.infer<typeof ScaffoldExport>;
