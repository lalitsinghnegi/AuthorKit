import { describe, expect, it, vi } from "vitest";
import { ProjectExport, ScaffoldExport } from "@/lib/model";
import { createProject } from "@/lib/storage/projects";
import { jar, withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { GET as packageZip } from "./projects/[id]/package/route";
import { GET as exportProject } from "./projects/[id]/export/route";
import { GET as exportPreset } from "./scaffold-templates/[id]/export/route";

withTempDataDir();
withSignedIn("viewer");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const req = new Request("http://x") as never;
const newProject = () =>
  createProject({
    name: "Launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach: "mobile-first",
  });

describe("export routes", () => {
  it("exports a project as a valid, importable file", async () => {
    const { id } = await newProject();
    const res = await exportProject(req, ctx(id));
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="acme-health-project.json"',
    );
    expect(ProjectExport.safeParse(await res.json()).success).toBe(true);
    expect((await exportProject(req, ctx("missing"))).status).toBe(404);
  });

  it("exports built-in presets as editable copies", async () => {
    const res = await exportPreset(req, ctx("basic"));
    const body = ScaffoldExport.parse(await res.json());
    expect(body.template.builtIn).toBe(false);
    expect((await exportPreset(req, ctx("nope"))).status).toBe(404);
  });

  it("refuse signed-out callers", async () => {
    const { id } = await newProject();
    jar.cookies.clear();
    expect((await exportProject(req, ctx(id))).status).toBe(401);
    expect((await exportPreset(req, ctx("basic"))).status).toBe(401);
  });
});

describe("package route under load", () => {
  it("answers 429 with Retry-After when the build limits are reached", async () => {
    const limit = await import("@/lib/generator/limit");
    const spy = vi.spyOn(limit, "buildForUser").mockRejectedValue(new limit.BusyError());
    const { id } = await newProject();
    const res = await packageZip(req, ctx(id));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("5");
    expect((await res.json()).error).toMatch(/busy/);
    spy.mockRestore();
  });
});
