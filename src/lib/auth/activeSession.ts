import { UserFile } from "@/lib/model/user";
import { readJson } from "@/lib/storage/files";
import type { SessionPayload } from "./token";

/**
 * True when the session's user still exists, is enabled and has the same
 * session version, so disabling a user or changing their role or password
 * ends their sessions on the very next request. Free of `server-only` so the
 * proxy can use it.
 */
export async function isSessionActive(payload: SessionPayload): Promise<boolean> {
  const users = (await readJson("users.json", UserFile))?.users ?? [];
  const user = users.find((u) => u.id === payload.userId);
  return Boolean(user && !user.disabled && user.sessionVersion === payload.version);
}
