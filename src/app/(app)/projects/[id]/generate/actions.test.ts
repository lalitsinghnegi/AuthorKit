import { describe, expect, it } from "vitest";
import { createProject, getProject } from "@/lib/storage/projects";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { savePackageOptionsAction } from "./actions";

withTempDataDir();
withSignedIn("admin");

describe("savePackageOptionsAction", () => {
  it("saves valid options and rejects invalid ones", async () => {
    const { id } = await createProject({
      name: "P",
      brandName: "Acme",
      prefix: "acme",
      approach: "mobile-first",
    });
    expect(
      await savePackageOptionsAction(id, { enabled: true, name: "acme-css", version: "1.2.3" }),
    ).toEqual({ ok: true });
    expect((await getProject(id))?.npm).toEqual({
      enabled: true,
      name: "acme-css",
      version: "1.2.3",
    });

    expect(
      await savePackageOptionsAction(id, { enabled: true, name: "Acme CSS", version: "1.2.3" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/^Name:/) });
    expect(
      await savePackageOptionsAction(id, { enabled: true, name: "acme-css", version: "v1" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/^Version:/) });
    expect((await getProject(id))?.npm?.version).toBe("1.2.3");
    expect(
      await savePackageOptionsAction("00000000-0000-4000-8000-000000000000", {
        enabled: false,
        name: "x",
        version: "1.0.0",
      }),
    ).toEqual({ ok: false, error: "This project no longer exists." });
  });
});
