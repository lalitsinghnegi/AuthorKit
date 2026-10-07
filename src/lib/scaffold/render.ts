import type { ScaffoldTree, TreeNode } from "@/lib/model";

/** `tree`-command style listing, with each file's CSS template noted. */
export function renderTreeText(tree: ScaffoldTree): string {
  const lines = [`${tree.name}/`];
  const visit = (children: TreeNode[], indent: string) => {
    children.forEach((child, i) => {
      const last = i === children.length - 1;
      const branch = last ? "└── " : "├── ";
      if (child.type === "folder") {
        lines.push(`${indent}${branch}${child.name}/`);
        visit(child.children, indent + (last ? "    " : "│   "));
      } else {
        const note = child.cssTemplateId ? `  ← ${child.cssTemplateId}` : "";
        lines.push(`${indent}${branch}${child.name}${note}`);
      }
    });
  };
  visit(tree.children, "");
  return lines.join("\n");
}
