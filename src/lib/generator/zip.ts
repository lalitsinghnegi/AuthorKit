import "server-only";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import type { GeneratedPackage } from "./types";

/** Fixed timestamp for every entry so identical packages produce identical bytes. */
export const ZIP_DATE = new Date("2000-01-01T00:00:00Z");

/** Reject anything that could escape the package root when extracted. */
export function assertSafePath(path: string): void {
  const parts = path.split("/");
  if (
    path === "" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /^[a-zA-Z]:/.test(path) ||
    parts.some((p) => p === "" || p === "." || p === "..")
  ) {
    throw new Error(`Unsafe path in package: ${JSON.stringify(path)}`);
  }
}

/** Stream the package as a zip with everything under `<rootName>/`. */
export function zipStream(pkg: GeneratedPackage): Readable {
  if (pkg.blocked) throw new Error("Cannot zip a package with errors");
  assertSafePath(pkg.rootName);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const at = (p: string) => {
    assertSafePath(p);
    return `${pkg.rootName}/${p}`;
  };

  archive.append("", { name: `${pkg.rootName}/`, date: ZIP_DATE });
  for (const folder of pkg.folders) archive.append("", { name: `${at(folder)}/`, date: ZIP_DATE });
  for (const file of pkg.files)
    archive.append(file.content, { name: at(file.path), date: ZIP_DATE });
  void archive.finalize();
  return archive;
}

/** Whole zip in memory (tests and small packages). */
export async function zipBuffer(pkg: GeneratedPackage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zipStream(pkg)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
