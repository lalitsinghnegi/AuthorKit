import { describe, expect, it, vi } from "vitest";
import { BASIC_PRESET, createFile, addNode } from "@/lib/scaffold";
import { getScaffoldTemplate, listScaffoldTemplates } from "@/lib/storage/scaffoldTemplates";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

const actions = await import("./actions");

withTempDataDir();
withSignedIn("admin");

const redirectTarget = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (err instanceof Redirect) return err.message;
    throw err;
  }
  throw new Error("expected a redirect");
};

const fileForm = (content: string) => {
  const data = new FormData();
  data.set("file", new File([content], "preset.json", { type: "application/json" }));
  return data;
};

describe("scaffold preset actions", () => {
  it("creates a new preset and opens it", async () => {
    expect(await redirectTarget(actions.createScaffoldTemplateAction())).toBe(
      "/templates/scaffolds/new-preset",
    );
    expect((await getScaffoldTemplate("new-preset"))?.tree.name).toBe("package");
  });

  it("duplicates a built-in preset with fresh ids", async () => {
    const url = await redirectTarget(actions.duplicateScaffoldTemplateAction("basic"));
    expect(url).toBe("/templates/scaffolds/basic-copy");
    const copy = (await getScaffoldTemplate("basic-copy"))!;
    expect(copy).toMatchObject({ name: "Basic copy", builtIn: false });
    expect(copy.tree.id).not.toBe(BASIC_PRESET.tree.id);
  });

  it("saves edits, but refuses built-ins and invalid trees", async () => {
    await redirectTarget(actions.duplicateScaffoldTemplateAction("basic"));
    const copy = (await getScaffoldTemplate("basic-copy"))!;
    const tree = addNode(copy.tree, copy.tree.id, createFile("extra.css", "cta"));

    expect(
      await actions.saveScaffoldTemplateAction("basic-copy", {
        tree,
        name: "Renamed",
        description: "d",
      }),
    ).toEqual({ ok: true });
    expect(await getScaffoldTemplate("basic-copy")).toMatchObject({
      name: "Renamed",
      description: "d",
    });

    expect(await actions.saveScaffoldTemplateAction("basic", { tree, name: "X" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/read-only/),
    });

    const bad = addNode(tree, tree.id, createFile("CON"));
    expect(
      await actions.saveScaffoldTemplateAction("basic-copy", { tree: bad, name: "X" }),
    ).toEqual({ ok: false, error: '"CON" is a reserved name on Windows' });
    expect(
      await actions.saveScaffoldTemplateAction("basic-copy", { tree, name: " " }),
    ).toMatchObject({ ok: false });
  });

  it("deletes custom presets", async () => {
    await redirectTarget(actions.duplicateScaffoldTemplateAction("basic"));
    expect(await redirectTarget(actions.deleteScaffoldTemplateAction("basic-copy"))).toBe(
      "/templates",
    );
    expect(await getScaffoldTemplate("basic-copy")).toBeNull();
  });

  it("imports an exported preset as a new custom preset", async () => {
    const exported = JSON.stringify({
      schemaVersion: 1,
      kind: "authorkit-scaffold",
      template: { ...BASIC_PRESET, builtIn: false },
    });
    expect(await redirectTarget(actions.importScaffoldTemplateAction({}, fileForm(exported)))).toBe(
      "/templates/scaffolds/basic-2",
    );
    expect((await listScaffoldTemplates()).map((t) => t.id)).toContain("basic-2");
  });

  it.each([
    ["bad JSON", "{nope", /not valid JSON/],
    ["wrong kind", '{"kind":"other"}', /not an AuthorKit scaffold preset/],
    [
      "bad shape",
      '{"kind":"authorkit-scaffold","schemaVersion":1}',
      /Preset file is invalid\. template/,
    ],
  ])("rejects %s on import", async (_label, content, message) => {
    expect((await actions.importScaffoldTemplateAction({}, fileForm(content))).error).toMatch(
      message,
    );
  });
});

describe("template breakpoints", () => {
  const wide = {
    breakpoints: [
      { id: "s", name: "small", maxWidth: 599 },
      { id: "m", name: "medium", minWidth: 600, maxWidth: 1199 },
      { id: "l", name: "large", minWidth: 1200 },
    ],
  };

  it("built-ins carry the standard set; duplicates copy the source's breakpoints", async () => {
    expect(BASIC_PRESET.breakpoints.breakpoints.map((b) => b.name)).toEqual([
      "mobile",
      "tablet",
      "desktop",
    ]);
    await redirectTarget(actions.duplicateScaffoldTemplateAction("basic"));
    expect((await getScaffoldTemplate("basic-copy"))?.breakpoints).toEqual(
      BASIC_PRESET.breakpoints,
    );
  });

  it("saves a custom template's breakpoints, refusing built-ins and overlaps", async () => {
    await redirectTarget(actions.createScaffoldTemplateAction());
    expect(
      await actions.saveTemplateBreakpointsAction("new-preset", { breakpoints: wide }),
    ).toEqual({
      ok: true,
      savedAt: expect.any(String),
    });
    expect((await getScaffoldTemplate("new-preset"))?.breakpoints).toEqual(wide);

    expect(
      await actions.saveTemplateBreakpointsAction("basic", { breakpoints: wide }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/read-only/),
    });
    const overlap = structuredClone(wide);
    overlap.breakpoints[1].maxWidth = 1200;
    expect(
      await actions.saveTemplateBreakpointsAction("new-preset", { breakpoints: overlap }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/both match 1200px/),
    });
  });

  it("imports older files without breakpoints with the standard set, and rejects bad ones", async () => {
    // JSON leaves out undefined fields, so this is a file saved before breakpoints existed.
    const old = { ...BASIC_PRESET, builtIn: false, breakpoints: undefined };
    const file = (template: object) =>
      fileForm(JSON.stringify({ schemaVersion: 1, kind: "authorkit-scaffold", template }));
    await redirectTarget(actions.importScaffoldTemplateAction({}, file(old)));
    expect((await getScaffoldTemplate("basic-2"))?.breakpoints).toEqual(BASIC_PRESET.breakpoints);

    const gap = structuredClone(wide);
    gap.breakpoints[1].minWidth = 700;
    const result = await actions.importScaffoldTemplateAction(
      {},
      file({ ...old, breakpoints: gap }),
    );
    expect(result.error).toMatch(/Preset file is invalid\. .*600/);
  });
});
