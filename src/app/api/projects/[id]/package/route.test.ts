import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { addNode, createFile } from "@/lib/scaffold";
import { createProject, saveResponsive, saveTokens, updateProject } from "@/lib/storage/projects";
import { readAudit } from "@/lib/audit/log";
import { jar, withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { vi } from "vitest";

let forceQualityError = false;
vi.mock("@/lib/quality/run", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/quality/run")>();
  return {
    ...real,
    runQualityChecks: async (...args: Parameters<typeof real.runQualityChecks>) => {
      const result = await real.runQualityChecks(...args);
      if (!forceQualityError) return result;
      const issue = {
        check: "variables" as const,
        severity: "error" as const,
        message: "--acme-x is used but never defined",
        path: "css/x.css",
      };
      return { ...result, quality: { ...result.quality, issues: [issue], blocked: true } };
    },
  };
});

const { GET } = await import("./route");

withTempDataDir();
withSignedIn("admin");

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
    const [entry] = (await readAudit()).entries;
    expect(entry).toMatchObject({ action: "package.download", target: { id: project.id } });
  });

  it("refuses signed-out callers", async () => {
    const project = await newProject();
    jar.cookies.clear();
    const res = await call(project.id);
    expect(res.status).toBe(401);
  });

  it("uses the saved tokens and responsive values", async () => {
    const project = await newProject();
    const [m, , d] = project.breakpoints.breakpoints;
    await saveTokens(project.id, [
      {
        id: "t1",
        name: "color-primary",
        type: "color",
        value: "#123456",
        originalValue: "#123456",
        status: "accepted",
      },
      {
        id: "t2",
        name: "color-text",
        type: "color",
        value: "#000000",
        originalValue: "#000000",
        status: "auto",
      },
    ]);
    await saveResponsive(project.id, {
      schemaVersion: 1,
      components: {
        footer: {
          mode: "breakpoints",
          frames: [],
          values: {
            [m.id]: { "footer-gap": { value: "24px", source: "frame" } },
            [project.breakpoints.breakpoints[1].id]: {
              "footer-gap": { value: "24px", source: "inferred" },
            },
            [d.id]: { "footer-gap": { value: "32px", source: "frame" } },
          },
          notes: [],
        },
      },
    });
    const zip = await JSZip.loadAsync(Buffer.from(await (await call(project.id)).arrayBuffer()));
    const tokens = await zip.file("acme-health/css/tokens.css")!.async("string");
    expect(tokens).toContain("--acme-color-primary: #123456;");
    expect(tokens).toContain("--acme-color-text: #1f2329;"); // still to review → default
    const footer = await zip.file("acme-health/css/components/footer.css")!.async("string");
    expect(footer).toMatch(
      /@media \(min-width: 1024px\) \{\n {2}\.acme-footer \{[\s\S]*--acme-footer-gap: 32px;/,
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

  it("returns 409 with the quality errors when a check fails", async () => {
    const project = await newProject();
    forceQualityError = true;
    try {
      const res = await call(project.id);
      expect(res.status).toBe(409);
      expect((await res.json()).quality).toEqual([
        {
          check: "variables",
          severity: "error",
          message: "--acme-x is used but never defined",
          path: "css/x.css",
        },
      ]);
    } finally {
      forceQualityError = false;
    }
  });

  it("returns 404 for unknown projects", async () => {
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call("../../etc")).status).toBe(404);
  });
});
