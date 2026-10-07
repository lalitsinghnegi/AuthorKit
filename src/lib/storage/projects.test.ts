import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignToken, ProjectInput } from "@/lib/model";
import { withTempDataDir } from "@/test/tempDataDir";
import {
  createProject,
  deleteProject,
  exportProject,
  getProject,
  getTokens,
  importProject,
  listProjects,
  saveTokens,
  slugify,
  updateProject,
} from "./projects";

const dataDir = withTempDataDir();

const input: ProjectInput = {
  name: "Spring launch",
  brandName: "Acme Health",
  prefix: "acme",
  approach: "mobile-first",
};

const token: DesignToken = {
  id: "t1",
  name: "color-primary",
  type: "color",
  value: "#1a2b3c",
  originalValue: "#1a2b3c",
  status: "accepted",
};

describe("projects repository", () => {
  it("creates a project with defaults and reads it back", async () => {
    const created = await createProject(input);
    expect(created.breakpoints.breakpoints.map((b) => b.name)).toEqual([
      "mobile",
      "tablet",
      "desktop",
    ]);
    expect(created.scaffold.name).toBe("acme-health");
    expect(await getProject(created.id)).toEqual(created);
  });

  it("rejects invalid input without writing anything", async () => {
    await expect(createProject({ ...input, prefix: "Bad-Prefix" })).rejects.toThrow();
    expect(await readdir(dataDir())).toEqual([]);
  });

  it("lists projects newest first and reports unreadable ones", async () => {
    const a = await createProject({ ...input, name: "A" });
    const b = await createProject({ ...input, name: "B" });
    await updateProject(a.id, (p) => ({ ...p, description: "touched" }));

    const brokenId = "00000000-0000-4000-8000-000000000000";
    await mkdir(path.join(dataDir(), "projects", brokenId), { recursive: true });
    await writeFile(path.join(dataDir(), "projects", brokenId, "project.json"), "{ nope");

    const { projects, invalid } = await listProjects();
    expect(projects.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(invalid).toEqual([brokenId]);
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getProject("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getProject("../../etc")).toBeNull();
  });

  it("updates with validation, keeping id and createdAt", async () => {
    const created = await createProject(input);
    const updated = await updateProject(created.id, (p) => ({ ...p, name: "Renamed", id: "x" }));
    expect(updated).toMatchObject({
      id: created.id,
      name: "Renamed",
      createdAt: created.createdAt,
    });

    await expect(updateProject(created.id, (p) => ({ ...p, prefix: "NO" }))).rejects.toThrow();
    expect((await getProject(created.id))!.name).toBe("Renamed");
  });

  it("deletes a project and its files", async () => {
    const created = await createProject(input);
    await saveTokens(created.id, [token]);
    await deleteProject(created.id);
    expect(await getProject(created.id)).toBeNull();
    expect(await readdir(path.join(dataDir(), "projects"))).toEqual([]);
    await expect(deleteProject("../..")).rejects.toThrow(/Invalid project id/);
  });

  it("saves and reads tokens; missing tokens file means none", async () => {
    const created = await createProject(input);
    expect(await getTokens(created.id)).toEqual([]);
    await saveTokens(created.id, [token]);
    expect(await getTokens(created.id)).toEqual([token]);
  });

  it("exports and imports a project as a new copy", async () => {
    const created = await createProject(input);
    await saveTokens(created.id, [token]);
    const exported = await exportProject(created.id);
    // Round-trip through JSON like a downloaded file.
    const imported = await importProject(JSON.parse(JSON.stringify(exported)));

    expect(imported.id).not.toBe(created.id);
    expect(imported).toMatchObject({ name: input.name, prefix: "acme" });
    expect(imported.scaffold).toEqual(created.scaffold);
    expect(await getTokens(imported.id)).toEqual([token]);
    expect((await listProjects()).projects).toHaveLength(2);
  });

  it("rejects importing a file that is not an AuthorKit export", async () => {
    await expect(importProject({ hello: "world" })).rejects.toThrow();
    await expect(
      importProject({ ...(await exportProject((await createProject(input)).id)), kind: "x" }),
    ).rejects.toThrow();
  });
});

describe("slugify", () => {
  it.each([
    ["Acme Health", "acme-health"],
    ["  Café & Co. ", "cafe-co"],
    ["!!!", ""],
  ])("%j → %j", (value, expected) => {
    expect(slugify(value)).toBe(expected);
  });
});
