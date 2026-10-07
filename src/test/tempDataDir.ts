import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

/** Point DATA_DIR at a fresh temp folder for each test. Returns a getter for the path. */
export function withTempDataDir(): () => string {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "authorkit-"));
    process.env.DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}
