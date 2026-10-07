import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

const { GET } = await import("./route");

let dir: string | undefined;

afterEach(async () => {
  delete process.env.DATA_DIR;
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("reports ok when storage is writable", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-"));
    process.env.DATA_DIR = dir;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", storage: "ok" });
  });

  it("returns 503 without details when storage is unusable", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-"));
    const file = path.join(dir, "not-a-dir");
    await writeFile(file, "");
    process.env.DATA_DIR = file;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", storage: "unavailable" });
  });
});
