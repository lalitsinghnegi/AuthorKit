import postcss, { type ChildNode, type Container, type Root } from "postcss";

const blankBefore = (node: ChildNode) => ((node.raws.before ?? "").match(/\n/g)?.length ?? 0) >= 2;
const isBlock = (node: ChildNode) =>
  node.type === "rule" || (node.type === "atrule" && Boolean(node.nodes));

/**
 * Normalise layout without touching values: 2-space indentation, one
 * declaration per line, ": " and ";", one selector per line, a blank line
 * between rules, at most one blank line anywhere (blank lines inside a rule,
 * e.g. between custom properties and declarations, are kept), and a final
 * newline. Comments keep their position relative to what they describe.
 */
export function formatCss(css: string): string {
  const root = postcss.parse(css);
  formatContainer(root, 0);
  root.raws.after = "\n";
  return root.toString();
}

function formatContainer(container: Root | Container, depth: number) {
  const indent = "  ".repeat(depth);
  const nodes = container.nodes ?? [];
  nodes.forEach((node, i) => {
    const prev = nodes[i - 1];
    let blank: boolean;
    if (!prev) blank = false;
    else if (node.type === "decl" || prev.type === "decl") blank = blankBefore(node);
    else if (isBlock(node) && isBlock(prev)) blank = true;
    else blank = blankBefore(node);
    node.raws.before =
      container.type === "root" && i === 0 ? "" : `\n${blank ? "\n" : ""}${indent}`;

    if (node.type === "decl") {
      // Multi-line values (e.g. several transitions) start on the next line, one step deeper.
      node.raws.between = /:\s*\n/.test(node.raws.between ?? "") ? `:\n${indent}  ` : ": ";
      if (node.value.includes("\n")) {
        node.value = node.value
          .split("\n")
          .map((line, i) => (i === 0 ? line.trim() : `${indent}  ${line.trim()}`))
          .join("\n");
      }
      if (node.important) node.raws.important = " !important";
    } else if (node.type === "rule") {
      node.selector = node.selectors.map((s) => s.trim()).join(`,\n${indent}`);
      node.raws.between = " ";
      node.raws.semicolon = true;
      node.raws.after = `\n${indent}`;
      formatContainer(node, depth + 1);
    } else if (node.type === "atrule") {
      node.params = node.params.trim();
      node.raws.afterName = node.params ? " " : "";
      node.raws.between = node.nodes ? " " : "";
      if (node.nodes) {
        node.raws.semicolon = true;
        node.raws.after = `\n${indent}`;
        formatContainer(node, depth + 1);
      }
    }
  });
}

export type Removal = { path?: string; description: string };

/**
 * Remove exact duplicates: a rule repeated in the same scope with the same
 * selector and declarations, and a declaration repeated inside one rule.
 */
export function dedupeCss(css: string): { css: string; removed: Removal[] } {
  const root = postcss.parse(css);
  const removed: Removal[] = [];

  root.walkRules((rule) => {
    const seen = new Set<string>();
    rule.each((node) => {
      if (node.type !== "decl") return;
      const key = `${node.prop}:${node.value}:${node.important ? "!" : ""}`;
      if (seen.has(key)) {
        removed.push({
          description: `Duplicate declaration “${node.prop}: ${node.value}” in ${rule.selector.replace(/\s+/g, " ")}`,
        });
        node.remove();
      } else seen.add(key);
    });
  });

  const dedupeScope = (container: Root | Container) => {
    const seen = new Set<string>();
    container.each((node) => {
      if (node.type === "rule") {
        const key = `${node.selectors.map((s) => s.trim()).join(",")}{${(node.nodes ?? [])
          .filter((n) => n.type === "decl")
          .map((d) => (d.type === "decl" ? `${d.prop}:${d.value}` : ""))
          .join(";")}}`;
        if (seen.has(key)) {
          removed.push({ description: `Duplicate rule ${node.selector.replace(/\s+/g, " ")}` });
          node.remove();
          return;
        }
        seen.add(key);
      } else if (node.type === "atrule" && node.nodes) {
        dedupeScope(node);
      }
    });
  };
  dedupeScope(root);
  return { css: root.toString(), removed };
}
