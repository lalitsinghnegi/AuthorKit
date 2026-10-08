import { describe, expect, it } from "vitest";
import { FolderNode as FolderSchema, ScaffoldTemplate, type FolderNode } from "@/lib/model";
import {
  BUILT_IN_SCAFFOLDS,
  TreeError,
  addNode,
  assignTemplate,
  cloneWithNewIds,
  createFile,
  createFolder,
  deleteNode,
  findNode,
  isWithin,
  listFolders,
  moveBlocker,
  moveNode,
  nodePath,
  renameNode,
  renderTreeText,
  shiftNode,
  treeHasErrors,
  uniqueChildName,
  unusedTemplates,
  validateName,
  validateTree,
} from "./index";

/** root/{css/{a.css, b.css, sub/{c.css}}, readme.md} with readable ids. */
function sample(): FolderNode {
  return {
    id: "root",
    type: "folder",
    name: "pkg",
    children: [
      {
        id: "css",
        type: "folder",
        name: "css",
        children: [
          { id: "a", type: "file", name: "a.css", cssTemplateId: "global" },
          { id: "b", type: "file", name: "b.css", cssTemplateId: "cta" },
          {
            id: "sub",
            type: "folder",
            name: "sub",
            children: [{ id: "c", type: "file", name: "c.css", cssTemplateId: "header" }],
          },
        ],
      },
      { id: "readme", type: "file", name: "readme.md", cssTemplateId: null },
    ],
  };
}

const names = (folder: FolderNode | undefined) => folder?.children.map((c) => c.name);
const folderOf = (tree: FolderNode, id: string) => findNode(tree, id)!.node as FolderNode;

describe("tree queries", () => {
  it("finds nodes with parent, index and ancestors", () => {
    const found = findNode(sample(), "c")!;
    expect(found.parent?.id).toBe("sub");
    expect(found.index).toBe(0);
    expect(found.ancestors.map((a) => a.id)).toEqual(["root", "css", "sub"]);
    expect(findNode(sample(), "nope")).toBeNull();
  });

  it("computes paths and containment", () => {
    expect(nodePath(sample(), "c")).toBe("pkg/css/sub/c.css");
    expect(isWithin(sample(), "css", "c")).toBe(true);
    expect(isWithin(sample(), "css", "css")).toBe(true);
    expect(isWithin(sample(), "sub", "a")).toBe(false);
  });

  it("lists folders with paths", () => {
    expect(listFolders(sample())).toEqual([
      { id: "root", path: "pkg" },
      { id: "css", path: "pkg/css" },
      { id: "sub", path: "pkg/css/sub" },
    ]);
  });
});

describe("tree edits", () => {
  it("adds folders and files at a position without mutating the input", () => {
    const tree = sample();
    const before = JSON.stringify(tree);
    const next = addNode(tree, "css", createFile("new.css"), 1);
    expect(names(folderOf(next, "css"))).toEqual(["a.css", "new.css", "b.css", "sub"]);
    const appended = addNode(next, "root", createFolder("js"));
    expect(names(appended)).toEqual(["css", "readme.md", "js"]);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("refuses to add into a file or with a duplicate id", () => {
    expect(() => addNode(sample(), "a", createFile("x.css"))).toThrow(TreeError);
    expect(() => addNode(sample(), "css", { ...createFile("x"), id: "b" })).toThrow(/Duplicate/);
  });

  it("renames, assigns templates and deletes", () => {
    let tree = renameNode(sample(), "a", "base.css");
    tree = assignTemplate(tree, "readme", null);
    tree = assignTemplate(tree, "a", "tokens");
    tree = deleteNode(tree, "sub");
    expect(folderOf(tree, "css").children).toEqual([
      { id: "a", type: "file", name: "base.css", cssTemplateId: "tokens" },
      { id: "b", type: "file", name: "b.css", cssTemplateId: "cta" },
    ]);
    expect(() => assignTemplate(tree, "css", "cta")).toThrow(/not a file/);
    expect(() => deleteNode(tree, "root")).toThrow(/root folder/);
    expect(() => renameNode(tree, "nope", "x")).toThrow(/not found/);
  });
});

describe("moving", () => {
  it("moves into another folder at an index", () => {
    const tree = moveNode(sample(), "readme", "sub", 0);
    expect(names(tree)).toEqual(["css"]);
    expect(names(folderOf(tree, "sub"))).toEqual(["readme.md", "c.css"]);
  });

  it("appends when no index is given", () => {
    expect(names(folderOf(moveNode(sample(), "a", "sub"), "sub"))).toEqual(["c.css", "a.css"]);
  });

  it("reorders within the same folder using pre-move positions", () => {
    // Drop "a" before "sub" (index 2) → b, a, sub
    expect(names(folderOf(moveNode(sample(), "a", "css", 2), "css"))).toEqual([
      "b.css",
      "a.css",
      "sub",
    ]);
    // Drop "sub" before "a" (index 0) → sub, a, b
    expect(names(folderOf(moveNode(sample(), "sub", "css", 0), "css"))).toEqual([
      "sub",
      "a.css",
      "b.css",
    ]);
  });

  it("blocks moving a folder into itself or its descendants, and moving the root", () => {
    expect(moveBlocker(sample(), "css", "sub")).toBe("A folder cannot be moved into itself");
    expect(moveBlocker(sample(), "css", "css")).toBe("A folder cannot be moved into itself");
    expect(moveBlocker(sample(), "root", "css")).toBe("The root folder cannot be moved");
    expect(moveBlocker(sample(), "a", "b")).toBe("Target is not a folder");
    expect(moveBlocker(sample(), "a", "sub")).toBeNull();
    expect(() => moveNode(sample(), "css", "sub")).toThrow(TreeError);
  });

  it("shifts up and down, stopping at the ends", () => {
    expect(names(folderOf(shiftNode(sample(), "a", 1), "css"))).toEqual(["b.css", "a.css", "sub"]);
    expect(names(folderOf(shiftNode(sample(), "sub", -1), "css"))).toEqual([
      "a.css",
      "sub",
      "b.css",
    ]);
    expect(shiftNode(sample(), "a", -1)).toEqual(sample());
    expect(shiftNode(sample(), "sub", 1)).toEqual(sample());
    expect(shiftNode(sample(), "root", 1)).toEqual(sample());
  });
});

describe("helpers", () => {
  it("makes unique child names, case-insensitively, keeping the extension", () => {
    const css = folderOf(sample(), "css");
    expect(uniqueChildName(css, "new.css")).toBe("new.css");
    expect(uniqueChildName(css, "A.css")).toBe("A-2.css");
    expect(uniqueChildName(css, "sub")).toBe("sub-2");
  });

  it("clones with fresh ids but the same shape", () => {
    const copy = cloneWithNewIds(sample());
    expect(copy.id).not.toBe("root");
    expect(renderTreeText(copy)).toBe(renderTreeText(sample()));
    expect(FolderSchema.safeParse(copy).success).toBe(true);
  });

  it("renders a tree listing", () => {
    expect(renderTreeText(sample())).toBe(
      [
        "pkg/",
        "├── css/",
        "│   ├── a.css  ← global",
        "│   ├── b.css  ← cta",
        "│   └── sub/",
        "│       └── c.css  ← header",
        "└── readme.md",
      ].join("\n"),
    );
  });

  it("renders extra root files first with their notes", () => {
    expect(
      renderTreeText(sample(), [{ name: "pkg.css", note: "entry" }, { name: "README.md" }])
        .split("\n")
        .slice(0, 4),
    ).toEqual(["pkg/", "├── pkg.css  ← entry", "├── README.md", "├── css/"]);
  });

  it("reports templates no file uses", () => {
    expect(unusedTemplates(sample())).toEqual(["tokens", "footer", "isi", "modals", "accordion"]);
  });
});

describe("validateName", () => {
  const siblings = [createFile("global.css")];

  it.each([
    ["", "Name is required"],
    ["my file.css", "Not allowed: space. Use letters, digits, dot, underscore or hyphen"],
    ["a/b", 'Not allowed: "/". Use letters, digits, dot, underscore or hyphen'],
    [
      'x<>:"|?*',
      'Not allowed: "<", ">", ":", """, "|", "?", "*". Use letters, digits, dot, underscore or hyphen',
    ],
    ["..", '".." is not allowed'],
    ["name.", "Name cannot end with a dot"],
    ["CON", '"CON" is a reserved name on Windows'],
    ["nul.css", '"nul.css" is a reserved name on Windows'],
    ["Global.CSS", '"Global.CSS" already exists in this folder'],
    ["x".repeat(101), "Name must be 100 characters or fewer"],
  ])("%j → %s", (name, message) => {
    expect(validateName(name, siblings)).toBe(message);
  });

  it.each(["global-2.css", "_partials", "v1.2", "console.css"])("accepts %j", (name) => {
    expect(validateName(name, siblings)).toBeNull();
  });
});

describe("validateTree", () => {
  it("finds nothing wrong with the built-in presets", () => {
    for (const preset of BUILT_IN_SCAFFOLDS) {
      expect(validateTree(preset.tree)).toEqual([]);
      expect(ScaffoldTemplate.safeParse(preset).success).toBe(true);
      expect(unusedTemplates(preset.tree)).toEqual([]);
    }
  });

  it("reports a duplicate once, on the later sibling", () => {
    const tree = addNode(sample(), "css", { ...createFile("A.CSS"), id: "dup" });
    expect(validateTree(tree).filter((i) => i.severity === "error")).toEqual([
      { nodeId: "dup", severity: "error", message: '"A.CSS" already exists in this folder' },
    ]);
  });

  it("errors on template files without .css; warns on empty css, duplicates and empty folders", () => {
    let tree = assignTemplate(sample(), "readme", "footer");
    tree = addNode(tree, "root", { ...createFile("blank.css"), id: "blank" });
    tree = addNode(tree, "root", { ...createFolder("empty"), id: "empty" });
    tree = addNode(tree, "root", { ...createFile("again.css", "cta"), id: "again" });
    const issues = validateTree(tree);
    expect(issues).toEqual(
      expect.arrayContaining([
        {
          nodeId: "readme",
          severity: "error",
          message: "Files with a CSS template must end in .css",
        },
        {
          nodeId: "blank",
          severity: "warning",
          message: "No CSS template assigned; this file will be empty",
        },
        { nodeId: "empty", severity: "warning", message: "Empty folder" },
        {
          nodeId: "b",
          severity: "warning",
          message: expect.stringMatching(/"cta" template is assigned to 2 files/),
        },
        { nodeId: "again", severity: "warning", message: expect.stringMatching(/"cta"/) },
      ]),
    );
    expect(treeHasErrors(issues)).toBe(true);
  });

  it("flags over-long paths", () => {
    let tree = sample();
    let parent = "root";
    for (let i = 0; i < 5; i++) {
      const f = { ...createFolder("d".repeat(45)), id: `deep${i}` };
      tree = addNode(tree, parent, f);
      parent = f.id;
    }
    tree = addNode(tree, parent, { ...createFile("x.css", "isi"), id: "leaf" });
    expect(validateTree(tree)).toContainEqual({
      nodeId: "leaf",
      severity: "error",
      message: "Path is longer than 200 characters",
    });
  });
});
