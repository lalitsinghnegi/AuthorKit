import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { addNode, createFile } from "@/lib/scaffold";
import { createProject, updateProject } from "@/lib/storage/projects";
import { withTempDataDir } from "@/test/tempDataDir";
import { GET } from "./route";

withTempDataDir();

const call = (id: string) =>
  GET(new Request("http://x") as never, { params: Promise.resolve({ id }) } as never);

const newProject = () =>
  createProject({
    name: "Launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach: "mobile-first",
  });

describe("GET /api/projects/[id]/package", () => {
  it("streams a zip named after the brand", async () => {
    const project = await newProject();
    const res = await call(project.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="acme-health-css-package.zip"',
    );

    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    expect(Object.keys(zip.files)).toContain("acme-health/acme-health.css");
    expect(Object.keys(zip.files)).toContain("acme-health/css/components/cta.css");
    expect(await zip.file("acme-health/acme-health.css")!.async("string")).toContain(
      '@import url("css/tokens.css");',
    );
  });

  it("returns 409 with the problems when the package has errors", async () => {
    const project = await newProject();
    await updateProject(project.id, (p) => ({
      ...p,
      scaffold: addNode(p.scaffold, p.scaffold.id, createFile("readme.MD")),
    }));
    const res = await call(project.id);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.problems[0]).toMatchObject({
      severity: "error",
      message: '"README.md" is generated automatically at the package root',
    });
  });

  it("returns 404 for unknown projects", async () => {
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call("../../etc")).status).toBe(404);
  });
});
