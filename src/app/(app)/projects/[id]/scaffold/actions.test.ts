import { describe, expect, it } from "vitest";
import { addNode, createFile, createFolder } from "@/lib/scaffold";
import { createProject, getProject } from "@/lib/storage/projects";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { saveProjectScaffoldAction, saveScaffoldAsPresetAction } from "./actions";

withTempDataDir();
withSignedIn("admin");

const newProject = () =>
  createProject({ name: "P", brandName: "Acme", prefix: "acme", approach: "mobile-first" });

describe("project scaffold actions", () => {
  it("saves a valid tree", async () => {
    const project = await newProject();
    const tree = addNode(
      project.scaffold,
      project.scaffold.id,
      createFolder("js", [createFile("app.js")]),
    );
    expect(await saveProjectScaffoldAction(project.id, { tree })).toEqual({ ok: true });
    expect((await getProject(project.id))?.scaffold).toEqual(tree);
  });

  it("refuses trees with errors and leaves the project unchanged", async () => {
    const project = await newProject();
    const tree = addNode(project.scaffold, project.scaffold.id, createFile("bad.txt", "cta"));
    expect(await saveProjectScaffoldAction(project.id, { tree })).toEqual({
      ok: false,
      error: "Files with a CSS template must end in .css",
    });
    expect(
      await saveProjectScaffoldAction(project.id, { tree: { nope: 1 } as never }),
    ).toMatchObject({ ok: false });
    expect((await getProject(project.id))?.scaffold).toEqual(project.scaffold);
  });

  it("refuses root files that clash with generated names", async () => {
    const project = await newProject();
    const tree = addNode(project.scaffold, project.scaffold.id, createFile("ACME.css"));
    expect(await saveProjectScaffoldAction(project.id, { tree })).toEqual({
      ok: false,
      error: '"acme.css" is generated automatically at the package root',
    });
  });

  it("reports a missing project", async () => {
    const project = await newProject();
    expect(
      await saveProjectScaffoldAction("00000000-0000-4000-8000-000000000000", {
        tree: project.scaffold,
      }),
    ).toEqual({ ok: false, error: "This project no longer exists." });
  });

  it("saves the tree as a new preset with fresh ids", async () => {
    const project = await newProject();
    const result = await saveScaffoldAsPresetAction("Acme layout", project.scaffold);
    expect(result).toEqual({ ok: true, id: "acme-layout", name: "Acme layout" });
    const preset = (await getScaffoldTemplate("acme-layout"))!;
    expect(preset.tree.id).not.toBe(project.scaffold.id);
    expect(await saveScaffoldAsPresetAction("  ", project.scaffold)).toMatchObject({ ok: false });
  });
});
