import { describe, expect, it, vi } from "vitest";
import { readAudit } from "@/lib/audit/log";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { exportProject, getProject, listProjects } from "@/lib/storage/projects";
import { saveScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";
import { BASIC_PRESET } from "@/lib/scaffold";
import { withoutIds } from "@/lib/breakpoints/presets";

class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

const { createProjectAction, importProjectAction } = await import("./actions");

withTempDataDir();
const me = withSignedIn("admin");

const form = (fields: Record<string, string | File>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const jsonFile = (content: string) =>
  new File([content], "project.json", { type: "application/json" });

const valid = { name: "Launch", brandName: "Acme", prefix: "acme", approach: "mobile-first" };

describe("createProjectAction", () => {
  it("returns field errors and echoes values when invalid", async () => {
    const state = await createProjectAction({}, form({ ...valid, brandName: " ", prefix: "X" }));
    expect(Object.keys(state.errors ?? {}).sort()).toEqual(["brandName", "prefix"]);
    expect(state.values?.name).toBe("Launch");
    expect((await listProjects()).projects).toHaveLength(0);
  });

  it("creates the project and redirects to it", async () => {
    await expect(createProjectAction({}, form(valid))).rejects.toThrow(/^\/projects\/[0-9a-f-]+$/);
    const [entry] = (await readAudit()).entries;
    expect(entry).toMatchObject({ action: "project.create", actor: { email: me().email } });
    expect((await listProjects()).projects[0]).toMatchObject({ name: "Launch", prefix: "acme" });
  });

  it("starts the project with the chosen template's folders and breakpoints", async () => {
    await saveScaffoldTemplate({
      ...BASIC_PRESET,
      id: "wide",
      name: "Wide",
      builtIn: false,
      breakpoints: {
        breakpoints: [
          { id: "s", name: "small", maxWidth: 599 },
          { id: "l", name: "large", minWidth: 600 },
        ],
      },
    });
    await expect(createProjectAction({}, form({ ...valid, templateId: "wide" }))).rejects.toThrow(
      Redirect,
    );
    const project = (await getProject((await listProjects()).projects[0].id))!;
    expect(withoutIds(project.breakpoints.breakpoints)).toEqual([
      { name: "small", maxWidth: 599 },
      { name: "large", minWidth: 600 },
    ]);
    // Fresh ids, not the template's.
    expect(project.breakpoints.breakpoints.map((b) => b.id)).not.toContain("s");
    expect(project.scaffold.children.map((c) => c.name)).toEqual(["css"]);
    expect(project.scaffold.name).toBe("acme");
  });

  it("uses the Component-based template by default and rejects unknown templates", async () => {
    const bad = await createProjectAction({}, form({ ...valid, templateId: "nope" }));
    expect(bad.errors?.templateId).toEqual(["This template no longer exists."]);
    await expect(createProjectAction({}, form(valid))).rejects.toThrow(Redirect);
    const project = (await getProject((await listProjects()).projects[0].id))!;
    expect(project.breakpoints.breakpoints.map((b) => b.name)).toEqual([
      "mobile",
      "tablet",
      "desktop",
    ]);
  });

  it("validates and stores the optional site URL", async () => {
    const bad = await createProjectAction({}, form({ ...valid, siteUrl: "javascript:alert(1)" }));
    expect(Object.keys(bad.errors ?? {})).toEqual(["siteUrl"]);
    await expect(
      createProjectAction({}, form({ ...valid, siteUrl: " https://www.acme.com " })),
    ).rejects.toThrow(Redirect);
    const [created] = (await listProjects()).projects;
    expect(created).toMatchObject({ siteUrl: "https://www.acme.com/" });
  });
});

describe("importProjectAction", () => {
  it.each([
    ["no file", form({}), /Choose a project\.json/],
    ["bad JSON", form({ file: jsonFile("{nope") }), /not valid JSON/],
    ["wrong kind", form({ file: jsonFile('{"hello":1}') }), /not an AuthorKit project export/],
    [
      "invalid project",
      form({ file: jsonFile('{"kind":"authorkit-project","schemaVersion":1,"tokens":[]}') }),
      /Project file is invalid\. project:/,
    ],
  ])("rejects %s with a clear message", async (_label, data, message) => {
    const state = await importProjectAction({}, data);
    expect(state.error).toMatch(message);
  });

  it("imports a valid export as a new project", async () => {
    await expect(createProjectAction({}, form(valid))).rejects.toThrow(Redirect);
    const [original] = (await listProjects()).projects;
    const exported = JSON.stringify(await exportProject(original.id));
    await expect(importProjectAction({}, form({ file: jsonFile(exported) }))).rejects.toThrow(
      Redirect,
    );
    expect((await listProjects()).projects).toHaveLength(2);
  });
});
