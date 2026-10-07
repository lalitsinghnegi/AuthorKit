import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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

/** Names of the sub-folders (or files, with `files: true`) in a data folder; [] if it does not exist. */
export async function listEntries(relativePath: string, { files = false } = {}): Promise<string[]> {
  try {
    const entries = await readdir(resolveDataPath(relativePath), { withFileTypes: true });
    return entries.filter((e) => (files ? e.isFile() : e.isDirectory())).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Remove a file or folder inside the data dir. */
export async function removeDataPath(relativePath: string): Promise<void> {
  const target = resolveDataPath(relativePath);
  if (target === getDataDir()) throw new Error("Refusing to remove the data directory");
  await rm(target, { recursive: true, force: true });
}

/** Confirm the data dir exists and is writable by round-tripping a probe file. */
export async function checkStorage(): Promise<void> {
  const probe = `.health-${randomUUID()}.json`;
  await writeJsonAtomic(probe, { ok: true });
  await rm(resolveDataPath(probe), { force: true });
}
