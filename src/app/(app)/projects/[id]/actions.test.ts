import { describe, expect, it } from "vitest";
import { readAudit } from "@/lib/audit/log";
import { createProject, getProject } from "@/lib/storage/projects";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { saveSiteUrlAction } from "./actions";

withTempDataDir();
withSignedIn("admin");

const newProject = () =>
  createProject({ name: "P", brandName: "Acme", prefix: "acme", approach: "mobile-first" });

describe("saveSiteUrlAction", () => {
  it("saves, normalises, rejects and clears the site URL", async () => {
    const { id } = await newProject();
    expect(await saveSiteUrlAction(id, "https://www.acme.com")).toEqual({
      ok: true,
      siteUrl: "https://www.acme.com/",
    });
    expect((await getProject(id))?.siteUrl).toBe("https://www.acme.com/");

    expect(await saveSiteUrlAction(id, "data:text/html,hi")).toMatchObject({ ok: false });
    expect((await getProject(id))?.siteUrl).toBe("https://www.acme.com/");

    expect(await saveSiteUrlAction(id, "  ")).toEqual({ ok: true, siteUrl: undefined });
    expect((await getProject(id))?.siteUrl).toBeUndefined();

    const actions = (await readAudit()).entries.map((e) => e.details);
    expect(actions).toEqual(["site removed", "site www.acme.com"]);
  });

  it("reports a missing project", async () => {
    expect(
      await saveSiteUrlAction("00000000-0000-4000-8000-000000000000", "https://acme.com"),
    ).toEqual({ ok: false, error: "This project no longer exists." });
  });
});
