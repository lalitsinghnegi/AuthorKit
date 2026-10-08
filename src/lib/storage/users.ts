import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { Email, type Role, SCHEMA_VERSION, type User, UserFile } from "@/lib/model";
import { readJson, writeJsonAtomic } from "./files";

const FILE = "users.json";

export class UserError extends Error {}

async function load(): Promise<User[]> {
  return (await readJson(FILE, UserFile))?.users ?? [];
}
async function save(users: User[]): Promise<void> {
  await writeJsonAtomic(FILE, UserFile.parse({ schemaVersion: SCHEMA_VERSION, users }));
}

export const listUsers = () => load();
export const hasUsers = async () => (await load()).length > 0;

export async function getUserById(id: string): Promise<User | null> {
  return (await load()).find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const parsed = Email.safeParse(email);
  if (!parsed.success) return null;
  return (await load()).find((u) => u.email === parsed.data) ?? null;
}

const activeAdmins = (users: User[]) => users.filter((u) => u.role === "admin" && !u.disabled);

export async function createUser(input: {
  email: string;
  name: string;
  role: Role;
  password: string;
}): Promise<User> {
  const email = Email.parse(input.email);
  const problem = passwordProblem(input.password, email);
  if (problem) throw new UserError(problem);
  const users = await load();
  if (users.some((u) => u.email === email))
    throw new UserError("A user with this email already exists.");
  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    email,
    name: input.name.trim(),
    role: input.role,
    passwordHash: await hashPassword(input.password),
    disabled: false,
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await save([...users, user]);
  return user;
}

/**
 * Change role or disabled flag. Refuses to leave the app without an active
 * admin, and to let an admin demote or disable themselves.
 */
export async function updateUser(
  actorId: string,
  id: string,
  change: { role?: Role; disabled?: boolean; name?: string },
): Promise<User> {
  const users = await load();
  const current = users.find((u) => u.id === id);
  if (!current) throw new UserError("That user no longer exists.");
  if (id === actorId && (change.role === "viewer" || change.disabled === true)) {
    throw new UserError("You cannot demote or disable yourself. Ask another admin.");
  }
  const next: User = {
    ...current,
    ...(change.name !== undefined ? { name: change.name.trim() } : {}),
    ...(change.role !== undefined ? { role: change.role } : {}),
    ...(change.disabled !== undefined ? { disabled: change.disabled } : {}),
    updatedAt: new Date().toISOString(),
  };
  const securityChange = next.role !== current.role || next.disabled !== current.disabled;
  if (securityChange) next.sessionVersion = current.sessionVersion + 1;
  const after = users.map((u) => (u.id === id ? next : u));
  if (activeAdmins(after).length === 0)
    throw new UserError("There must always be at least one active admin.");
  await save(after);
  return next;
}

/** Set a new password; signs the user out everywhere. */
export async function setPassword(id: string, password: string): Promise<User> {
  const users = await load();
  const current = users.find((u) => u.id === id);
  if (!current) throw new UserError("That user no longer exists.");
  const problem = passwordProblem(password, current.email);
  if (problem) throw new UserError(problem);
  const next: User = {
    ...current,
    passwordHash: await hashPassword(password),
    sessionVersion: current.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  await save(users.map((u) => (u.id === id ? next : u)));
  return next;
}

export async function deleteUser(actorId: string, id: string): Promise<User> {
  if (id === actorId) throw new UserError("You cannot delete yourself.");
  const users = await load();
  const target = users.find((u) => u.id === id);
  if (!target) throw new UserError("That user no longer exists.");
  const after = users.filter((u) => u.id !== id);
  if (activeAdmins(after).length === 0)
    throw new UserError("There must always be at least one active admin.");
  await save(after);
  return target;
}
