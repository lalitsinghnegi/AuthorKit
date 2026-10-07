import { describe, expect, it } from "vitest";
import { defaultBreakpoints, defaultScaffold } from "./defaults";
import {
  BreakpointSet,
  FigmaLink,
  FolderNode,
  Prefix,
  Project,
  ProjectInput,
  ScaffoldTemplate,
  Settings,
  TokenFile,
  walkTree,
  type DesignToken,
} from "./index";

const now = "2026-10-07T12:00:00.000Z";

function validProject() {
  return {
    schemaVersion: 1,
    id: "3f1c2a9e-8b7d-4c6e-9f1a-2b3c4d5e6f70",
    name: "Acme launch",
    brandName: "Acme",
    prefix: "acme",
    approach: "mobile-first",
    breakpoints: defaultBreakpoints(),
    scaffold: defaultScaffold("acme"),
    figmaLinks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function validLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    label: "Global styles",
    scope: "global",
    url: "https://www.figma.com/design/AbCdEf1234567890/Acme?node-id=1-2",
    fileKey: "AbCdEf1234567890",
    nodeId: "1:2",
    ...overrides,
  };
}

const token = (overrides: Partial<DesignToken> = {}): DesignToken => ({
  id: "t1",
  name: "color-primary",
  type: "color",
  value: "#1a2b3c",
  originalValue: "#1a2b3c",
  status: "auto",
  ...overrides,
});

describe("Prefix", () => {
  it.each(["ak", "acme", "brand2", "abcdefghij"])("accepts %s", (p) => {
    expect(Prefix.safeParse(p).success).toBe(true);
  });
  it.each(["", "a", "Ak", "2ak", "ak-", "ak_x", "abcdefghijk", "a k"])("rejects %j", (p) => {
    expect(Prefix.safeParse(p).success).toBe(false);
  });
});

describe("ProjectInput", () => {
  it("requires name, brand name and prefix, and trims text", () => {
    const parsed = ProjectInput.parse({
      name: "  Launch ",
      brandName: " Acme ",
      prefix: "acme",
      approach: "desktop-first",
    });
    expect(parsed).toMatchObject({ name: "Launch", brandName: "Acme" });

    const result = ProjectInput.safeParse({ name: " ", brandName: "", prefix: "", approach: "x" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["name", "brandName", "prefix", "approach"]));
  });
});

describe("Project", () => {
  it("accepts a complete project with defaults", () => {
    expect(Project.parse(validProject()).prefix).toBe("acme");
  });

  it("rejects a Figma link pointing at an unknown breakpoint", () => {
    const project = validProject();
    project.figmaLinks = [validLink({ breakpointId: "nope" })] as never;
    const result = Project.safeParse(project);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/unknown breakpoint/);
  });

  it("accepts a Figma link pointing at a real breakpoint", () => {
    const project = validProject();
    project.figmaLinks = [
      validLink({ breakpointId: project.breakpoints.breakpoints[0].id }),
    ] as never;
    expect(Project.safeParse(project).success).toBe(true);
  });

  it("rejects duplicate scaffold node ids across the tree", () => {
    const project = validProject();
    const [css] = project.scaffold.children as FolderNode[];
    css.children[1].id = css.children[0].id;
    expect(Project.safeParse(project).success).toBe(false);
  });

  it("rejects an unsupported schema version", () => {
    expect(Project.safeParse({ ...validProject(), schemaVersion: 2 }).success).toBe(false);
  });
});

describe("BreakpointSet", () => {
  it("rejects duplicate names", () => {
    const result = BreakpointSet.safeParse({
      breakpoints: [
        { id: "a", name: "mobile", maxWidth: 767 },
        { id: "b", name: "mobile", minWidth: 768 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty set and non-integer widths", () => {
    expect(BreakpointSet.safeParse({ breakpoints: [] }).success).toBe(false);
    expect(
      BreakpointSet.safeParse({ breakpoints: [{ id: "a", name: "m", maxWidth: 767.5 }] }).success,
    ).toBe(false);
  });
});

describe("Scaffold tree", () => {
  it("default scaffold assigns every built-in CSS template once", () => {
    const ids = [...walkTree(defaultScaffold("x"))].flatMap((n) =>
      n.type === "file" && n.cssTemplateId ? [n.cssTemplateId] : [],
    );
    expect(ids.sort()).toEqual(
      ["accordion", "cta", "footer", "global", "header", "isi", "modals", "tokens"].sort(),
    );
  });

  it("rejects duplicate names in a folder, case-insensitively", () => {
    const tree = {
      id: "r",
      type: "folder",
      name: "root",
      children: [
        { id: "a", type: "file", name: "Global.css", cssTemplateId: null },
        { id: "b", type: "file", name: "global.css", cssTemplateId: null },
      ],
    };
    expect(FolderNode.safeParse(tree).success).toBe(false);
  });

  it.each(["..", ".", "a/b", "a\\b", ""])("rejects unsafe name %j", (name) => {
    const tree = { id: "r", type: "folder", name, children: [] };
    expect(FolderNode.safeParse(tree).success).toBe(false);
  });

  it("rejects unknown CSS template ids", () => {
    const tree = {
      id: "r",
      type: "folder",
      name: "root",
      children: [{ id: "a", type: "file", name: "x.css", cssTemplateId: "carousel" }],
    };
    expect(FolderNode.safeParse(tree).success).toBe(false);
  });

  it("validates scaffold templates, including unique node ids", () => {
    const template = { schemaVersion: 1, id: "basic", name: "Basic", builtIn: true };
    expect(ScaffoldTemplate.safeParse({ ...template, tree: defaultScaffold("x") }).success).toBe(
      true,
    );
    const tree = defaultScaffold("x");
    tree.children[0].id = tree.id;
    expect(ScaffoldTemplate.safeParse({ ...template, tree }).success).toBe(false);
  });
});

describe("FigmaLink", () => {
  it("requires a page name for page links", () => {
    expect(FigmaLink.safeParse(validLink({ scope: "page" })).success).toBe(false);
    expect(FigmaLink.safeParse(validLink({ scope: "page", pageName: "Home" })).success).toBe(true);
  });

  it.each([
    "http://www.figma.com/design/AbCdEf1234567890/x",
    "https://evil.com/design/AbCdEf1234567890/x",
    "https://figma.com.evil.com/design/AbCdEf1234567890/x",
  ])("rejects non-Figma or insecure url %s", (url) => {
    expect(FigmaLink.safeParse(validLink({ url })).success).toBe(false);
  });
});

describe("TokenFile", () => {
  it("accepts tokens and rejects duplicate names", () => {
    expect(TokenFile.safeParse({ schemaVersion: 1, tokens: [token()] }).success).toBe(true);
    const dup = { schemaVersion: 1, tokens: [token(), token({ id: "t2" })] };
    expect(TokenFile.safeParse(dup).success).toBe(false);
  });

  it("rejects names that are not valid custom-property suffixes", () => {
    const bad = { schemaVersion: 1, tokens: [token({ name: "Color Primary" })] };
    expect(TokenFile.safeParse(bad).success).toBe(false);
  });
});

describe("Settings", () => {
  it("accepts empty settings and an encrypted token payload", () => {
    expect(Settings.safeParse({ schemaVersion: 1 }).success).toBe(true);
    const figmaToken = { iv: "AAAA", ciphertext: "AAAA", tag: "AAAA" };
    expect(Settings.safeParse({ schemaVersion: 1, figmaToken }).success).toBe(true);
    expect(Settings.safeParse({ schemaVersion: 1, figmaToken: "plain" }).success).toBe(false);
  });
});
