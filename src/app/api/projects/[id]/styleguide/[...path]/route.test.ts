import { describe, expect, it } from "vitest";
import { addNode, createFile } from "@/lib/scaffold";
import { createProject, updateProject } from "@/lib/storage/projects";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { GET } from "./route";

withTempDataDir();
withSignedIn("admin");

const call = (id: string, path: string[]) =>
  GET(new Request("http://x") as never, { params: Promise.resolve({ id, path }) } as never);

const newProject = () =>
  createProject({
    name: "Launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach: "mobile-first",
  });

describe("GET /api/projects/[id]/styleguide/[...path]", () => {
  it("serves the guide and the package files it links to", async () => {
    const { id } = await newProject();
    const index = await call(id, ["style-guide", "index.html"]);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await index.text()).toContain("Acme Health · Style guide");

    const entry = await call(id, ["acme-health.css"]);
    expect(entry.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await entry.text()).toContain('@import url("css/tokens.css");');

    expect((await call(id, ["css", "components", "cta.css"])).status).toBe(200);
    expect((await call(id, ["style-guide", "states.css"])).status).toBe(200);
    expect((await call(id, ["style-guide", "styleguide.js"])).headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
  });

  it.each([
    [["style-guide", "..", "..", "package.json"]],
    [["..%2F..%2Fpackage.json"]],
    [["style-guide", "nope.html"]],
    [["data", "settings.json"]],
  ])("returns 404 for %j", async (path) => {
    const { id } = await newProject();
    expect((await call(id, path)).status).toBe(404);
  });

  it("explains when the package cannot be generated", async () => {
    const project = await newProject();
    await updateProject(project.id, (p) => ({
      ...p,
      scaffold: addNode(p.scaffold, p.scaffold.id, createFile("CON")),
    }));
    const res = await call(project.id, ["style-guide", "index.html"]);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("The package has errors");
    expect(
      (await call("00000000-0000-4000-8000-000000000000", ["style-guide", "index.html"])).status,
    ).toBe(404);
  });
  it("refuses malformed or escaping paths and sets a strict policy", async () => {
    const { id } = await newProject();
    for (const path of [
      ["%E0%A4%A"],
      ["style-guide%00", "index.html"],
      ["..\\acme-health.css"],
      ["/etc/passwd"],
      ["style-guide", "%2e%2e", "README.md"],
    ]) {
      const res = await call(id, path);
      expect(res.status, path.join("/")).toBe(404);
    }
    const res = await call(id, ["style-guide", "index.html"]);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
