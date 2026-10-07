import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { checkStorage, readJson, resolveDataPath, writeJsonAtomic } from "./files";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "authorkit-"));
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

const Schema = z.object({ name: z.string() });

describe("storage", () => {
  it("writes and reads JSON, creating folders as needed", async () => {
    await writeJsonAtomic("projects/a/project.json", { name: "A" });
    expect(await readJson("projects/a/project.json", Schema)).toEqual({ name: "A" });
  });

  it("leaves no temp files behind", async () => {
    await writeJsonAtomic("x.json", { name: "x" });
    expect(await readdir(dir)).toEqual(["x.json"]);
  });

  it("returns null for a missing file", async () => {
    expect(await readJson("missing.json", Schema)).toBeNull();
  });

  it("rejects data that fails the schema", async () => {
    await writeJsonAtomic("bad.json", { name: 42 });
    await expect(readJson("bad.json", Schema)).rejects.toThrow();
  });

  it("rejects paths that escape the data dir", () => {
    expect(() => resolveDataPath("../outside.json")).toThrow(/escapes/);
    expect(() => resolveDataPath("/etc/passwd")).toThrow(/escapes/);
  });

  it("checkStorage succeeds on a writable dir and cleans up", async () => {
    await checkStorage();
    expect(await readdir(dir)).toEqual([]);
  });
});
