import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDataDir } from "@/test/tempDataDir";
import { ROTATE_BYTES, audit, readAudit } from "./log";

const dataDir = withTempDataDir();
const ada = { id: "u1", email: "ada@example.com" };

describe("audit log", () => {
  it("appends one JSON line per event and reads newest first", async () => {
    await audit(ada, {
      action: "project.create",
      target: { type: "project", id: "p1", name: "One" },
    });
    await audit(null, { action: "auth.login_failed", details: "email x@example.com" });
    const raw = await readFile(path.join(dataDir(), "audit.log"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(2);
    const { entries, total } = await readAudit();
    expect(total).toBe(2);
    expect(entries.map((e) => e.action)).toEqual(["auth.login_failed", "project.create"]);
    expect(entries[1]).toMatchObject({ actor: ada, target: { id: "p1" } });
  });

  it("filters and paginates", async () => {
    for (let i = 0; i < 5; i++)
      await audit(ada, { action: "tokens.save", target: { type: "project", id: `p${i % 2}` } });
    await audit(
      { id: "u2", email: "bo@example.com" },
      { action: "mapping.save", target: { type: "project", id: "p0" } },
    );
    expect((await readAudit({ actor: "bo@example.com" })).total).toBe(1);
    expect((await readAudit({ action: "tokens.save" })).total).toBe(5);
    expect((await readAudit({ projectId: "p0" })).total).toBe(4);
    const page2 = await readAudit({ pageSize: 4, page: 2 });
    expect(page2.entries).toHaveLength(2);
    expect(page2.total).toBe(6);
  });

  it("skips corrupt lines", async () => {
    await audit(ada, { action: "a.one" });
    await writeFile(
      path.join(dataDir(), "audit.log"),
      `${await readFile(path.join(dataDir(), "audit.log"), "utf8")}{"half":\nnot json\n`,
    );
    await audit(ada, { action: "a.two" });
    expect((await readAudit()).entries.map((e) => e.action)).toEqual(["a.two", "a.one"]);
  });

  it("rotates a large log", async () => {
    await writeFile(path.join(dataDir(), "audit.log"), "x".repeat(ROTATE_BYTES + 1));
    await audit(ada, { action: "after.rotate" });
    const files = await readdir(dataDir());
    expect(files.filter((f) => /^audit-.*\.log$/.test(f))).toHaveLength(1);
    expect((await readAudit()).entries.map((e) => e.action)).toEqual(["after.rotate"]);
  });
});
