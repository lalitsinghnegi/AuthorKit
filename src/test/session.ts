import { randomUUID } from "node:crypto";
import { beforeEach } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "@/lib/auth/token";
import { SCHEMA_VERSION, UserFile, type Role, type User } from "@/lib/model";
import { readJson, writeJsonAtomic } from "@/lib/storage/files";

/**
 * Cookie and header jar behind the `next/headers` mock in vitest.setup.ts.
 * Cleared after every test.
 */
export const jar = { cookies: new Map<string, string>(), headers: new Headers() };

export const TEST_PASSWORD = "correct horse battery";
let hash: Promise<string> | undefined;
/** One real scrypt hash shared by all test users, so tests stay fast. */
export const testHash = () => (hash ??= hashPassword(TEST_PASSWORD));

/** Write a user straight to users.json (DATA_DIR must already point at a temp folder). */
export async function addTestUser(role: Role, overrides: Partial<User> = {}): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    email: `${role}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    name: role === "admin" ? "Ada Admin" : "Vic Viewer",
    role,
    passwordHash: await testHash(),
    disabled: false,
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  const users = (await readJson("users.json", UserFile))?.users ?? [];
  await writeJsonAtomic("users.json", { schemaVersion: SCHEMA_VERSION, users: [...users, user] });
  return user;
}

/** Put a valid session cookie for this user in the jar. */
export function setSessionCookie(user: Pick<User, "id" | "sessionVersion">): void {
  jar.cookies.set(
    SESSION_COOKIE,
    signSession(
      { userId: user.id, version: user.sessionVersion, expiresAt: Date.now() + SESSION_TTL_MS },
      process.env.SESSION_SECRET!,
    ),
  );
}

export async function signInAs(role: Role): Promise<User> {
  const user = await addTestUser(role);
  setSessionCookie(user);
  return user;
}

/** Sign in as a fresh user of this role before each test (after withTempDataDir). Returns a getter. */
export function withSignedIn(role: Role): () => User {
  let user: User;
  beforeEach(async () => {
    user = await signInAs(role);
  });
  return () => user;
}
