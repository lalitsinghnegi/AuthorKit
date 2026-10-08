import "server-only";
import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { AuditEntry } from "@/lib/model";
import { resolveDataPath } from "@/lib/storage/files";

const FILE = "audit.log";
export const ROTATE_BYTES = 5 * 1024 * 1024;

export type Actor = { id: string; email: string } | null;
export type AuditInput = Omit<AuditEntry, "ts" | "actor">;

/**
 * Append one JSON line. Single-line appends from one process do not
 * interleave. The file is rotated to audit-<timestamp>.log past ROTATE_BYTES.
 * Callers pass summaries only: never tokens, passwords or values that could hold secrets.
 */
export async function audit(actor: Actor, entry: AuditInput): Promise<void> {
  const file = resolveDataPath(FILE);
  await mkdir(path.dirname(file), { recursive: true });
  try {
    if ((await stat(file)).size > ROTATE_BYTES) {
      await rename(
        file,
        resolveDataPath(`audit-${new Date().toISOString().replace(/[:.]/g, "-")}.log`),
      );
    }
  } catch {
    // No file yet.
  }
  const line = AuditEntry.parse({ ts: new Date().toISOString(), actor, ...entry });
  await appendFile(file, `${JSON.stringify(line)}\n`, "utf8");
}

export type AuditQuery = {
  actor?: string;
  action?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
};

/** Newest first, filtered, paginated. Malformed lines are skipped. */
export async function readAudit(
  query: AuditQuery = {},
): Promise<{ entries: AuditEntry[]; total: number }> {
  let raw = "";
  try {
    raw = await readFile(resolveDataPath(FILE), "utf8");
  } catch {
    return { entries: [], total: 0 };
  }
  const all: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = AuditEntry.safeParse(JSON.parse(line));
      if (parsed.success) all.push(parsed.data);
    } catch {
      // Skip partial or corrupt lines.
    }
  }
  const filtered = all
    .reverse()
    .filter((e) => !query.actor || e.actor?.email === query.actor)
    .filter((e) => !query.action || e.action === query.action)
    .filter(
      (e) => !query.projectId || (e.target?.type === "project" && e.target.id === query.projectId),
    );
  const pageSize = query.pageSize ?? 50;
  const page = Math.max(1, query.page ?? 1);
  return {
    entries: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
  };
}
