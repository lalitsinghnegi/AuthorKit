import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

/** Root folder for all persisted JSON. Configured with DATA_DIR (default ./data). */
export function getDataDir(): string {
  // Runtime data, not source: keep the bundler from tracing it.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "data");
}

/** Resolve a path inside the data dir, rejecting anything that escapes it. */
export function resolveDataPath(relativePath: string): string {
  const root = getDataDir();
  const full = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Path escapes data directory: ${relativePath}`);
  }
  return full;
}

/** Write JSON atomically: write a temp file in the same folder, then rename over the target. */
export async function writeJsonAtomic(relativePath: string, data: unknown): Promise<void> {
  const target = resolveDataPath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Read and validate a JSON file. Returns null when the file does not exist. */
export async function readJson<T>(relativePath: string, schema: z.ZodType<T>): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(resolveDataPath(relativePath), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return schema.parse(JSON.parse(raw));
}

/** Confirm the data dir exists and is writable by round-tripping a probe file. */
export async function checkStorage(): Promise<void> {
  const probe = `.health-${randomUUID()}.json`;
  await writeJsonAtomic(probe, { ok: true });
  await rm(resolveDataPath(probe), { force: true });
}
