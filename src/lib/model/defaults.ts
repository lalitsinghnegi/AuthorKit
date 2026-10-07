import { randomUUID } from "node:crypto";
import type { BreakpointSet } from "./breakpoints";
import type { CssTemplateId } from "./cssTemplate";
import type { FileNode, FolderNode, ScaffoldTree } from "./scaffold";

export function defaultBreakpoints(): BreakpointSet {
  return {
    breakpoints: [
      { id: randomUUID(), name: "mobile", maxWidth: 767 },
      { id: randomUUID(), name: "tablet", minWidth: 768, maxWidth: 1023 },
      { id: randomUUID(), name: "desktop", minWidth: 1024 },
    ],
  };
}

const file = (name: string, cssTemplateId: CssTemplateId | null): FileNode => ({
  id: randomUUID(),
  type: "file",
  name,
  cssTemplateId,
});
const folder = (name: string, children: FolderNode["children"]): FolderNode => ({
  id: randomUUID(),
  type: "folder",
  name,
  children,
});

/** Starting scaffold for a new project. The scaffold designer (Prompt 4) adds presets. */
export function defaultScaffold(rootName: string): ScaffoldTree {
  return folder(rootName, [
    folder("css", [
      file("tokens.css", "tokens"),
      file("global.css", "global"),
      folder("components", [
        file("header.css", "header"),
        file("footer.css", "footer"),
        file("isi.css", "isi"),
        file("modals.css", "modals"),
        file("cta.css", "cta"),
        file("accordion.css", "accordion"),
      ]),
    ]),
  ]);
}
