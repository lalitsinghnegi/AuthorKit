/** Result shape for server actions called directly from client editors. */
export type SaveResult = { ok: true } | { ok: false; error: string };
