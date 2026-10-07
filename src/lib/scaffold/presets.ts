import type { CssTemplateId, FileNode, FolderNode, ScaffoldTemplate, TreeNode } from "@/lib/model";

// Built-in presets use stable ids so they validate as stored templates.
// Projects receive a copy with fresh ids (see cloneWithNewIds).
const file = (id: string, name: string, cssTemplateId: CssTemplateId): FileNode => ({
  id,
  type: "file",
  name,
  cssTemplateId,
});
const folder = (id: string, name: string, children: TreeNode[]): FolderNode => ({
  id,
  type: "folder",
  name,
  children,
});

export const BASIC_PRESET: ScaffoldTemplate = {
  schemaVersion: 1,
  id: "basic",
  name: "Basic",
  description: "One flat css/ folder with every stylesheet.",
  builtIn: true,
  tree: folder("basic-root", "package", [
    folder("basic-css", "css", [
      file("basic-tokens", "tokens.css", "tokens"),
      file("basic-global", "global.css", "global"),
      file("basic-header", "header.css", "header"),
      file("basic-footer", "footer.css", "footer"),
      file("basic-isi", "isi.css", "isi"),
      file("basic-modals", "modals.css", "modals"),
      file("basic-cta", "cta.css", "cta"),
      file("basic-accordion", "accordion.css", "accordion"),
    ]),
  ]),
};

export const COMPONENT_PRESET: ScaffoldTemplate = {
  schemaVersion: 1,
  id: "component-based",
  name: "Component-based",
  description: "Tokens and global styles at the top, one file per component in css/components/.",
  builtIn: true,
  tree: folder("cb-root", "package", [
    folder("cb-css", "css", [
      file("cb-tokens", "tokens.css", "tokens"),
      file("cb-global", "global.css", "global"),
      folder("cb-components", "components", [
        file("cb-header", "header.css", "header"),
        file("cb-footer", "footer.css", "footer"),
        file("cb-isi", "isi.css", "isi"),
        file("cb-modals", "modals.css", "modals"),
        file("cb-cta", "cta.css", "cta"),
        file("cb-accordion", "accordion.css", "accordion"),
      ]),
    ]),
  ]),
};

export const BUILT_IN_SCAFFOLDS: readonly ScaffoldTemplate[] = [BASIC_PRESET, COMPONENT_PRESET];

export const isBuiltInScaffoldId = (id: string) => BUILT_IN_SCAFFOLDS.some((t) => t.id === id);
