import type { ScaffoldTree, TreeNode } from "@/lib/model";

/** Generated files listed first at the root, e.g. the brand entry stylesheet and README. */
export type ExtraRootFile = { name: string; note?: string };

/**
 * `tree`-command style listing. Files show their CSS template; extra root
 * files show their note.
 */
export function renderTreeText(tree: ScaffoldTree, extraRootFiles: ExtraRootFile[] = []): string {
  const notes = new Map<string, string | undefined>();
  const extras: TreeNode[] = extraRootFiles.map((f) => {
    const id = `extra:${f.name}`;
    notes.set(id, f.note);
    return { id, type: "file", name: f.name, cssTemplateId: null };
  });

  const lines = [`${tree.name}/`];
  const visit = (children: TreeNode[], indent: string) => {
    children.forEach((child, i) => {
      const last = i === children.length - 1;
      const branch = last ? "└── " : "├── ";
      if (child.type === "folder") {
        lines.push(`${indent}${branch}${child.name}/`);
        visit(child.children, indent + (last ? "    " : "│   "));
        return;
      }
      const note = notes.has(child.id) ? notes.get(child.id) : child.cssTemplateId;
      lines.push(`${indent}${branch}${child.name}${note ? `  ← ${note}` : ""}`);
    });
  };
  visit([...extras, ...tree.children], "");
  return lines.join("\n");
}
