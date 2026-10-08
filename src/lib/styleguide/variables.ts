import postcss from "postcss";

export type VariableValue = {
  /** Value outside any media query. */
  base?: string;
  /** Values set inside media queries, in file order. */
  overrides: { condition: string; value: string }[];
  /** File that declares the base value. */
  file?: string;
};

/** Every custom property declared in the package, with its base value and per-media overrides. */
export function collectVariables(
  files: { path: string; content: string }[],
): Map<string, VariableValue> {
  const vars = new Map<string, VariableValue>();
  for (const file of files) {
    postcss.parse(file.content).walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      const name = decl.prop.slice(2);
      const entry = vars.get(name) ?? { overrides: [] };
      const media =
        decl.parent?.parent?.type === "atrule" ? (decl.parent.parent as postcss.AtRule) : undefined;
      if (media?.name === "media") {
        if (!entry.overrides.some((o) => o.condition === media.params && o.value === decl.value)) {
          entry.overrides.push({ condition: media.params, value: decl.value });
        }
      } else if (entry.base === undefined) {
        entry.base = decl.value;
        entry.file = file.path;
      }
      vars.set(name, entry);
    });
  }
  return vars;
}
