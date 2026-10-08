import { describe, expect, it, vi } from "vitest";
import { readAudit } from "@/lib/audit/log";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { exportProject, listProjects } from "@/lib/storage/projects";

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
