import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { type Role, type User } from "@/lib/model";
import { getUserById } from "@/lib/storage/users";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getSessionSecret,
  signSession,
  verifySession,
} from "./token";

export class AuthError extends Error {
  constructor(readonly code: "signed_out" | "forbidden") {
    super(
      code === "signed_out"
        ? "Your session has ended. Sign in again."
        : "You need admin access to change this.",
    );
    this.name = "AuthError";
  }
}

export const ADMIN_ONLY = "You need admin access to change this.";

/** The signed-in, enabled user whose session version still matches, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // The expiry check reads the clock, so this must run at request time, never in a prerender.
  await connection();
  const payload = verifySession(token, getSessionSecret());
  if (!payload) return null;
  const user = await getUserById(payload.userId);
  if (!user || user.disabled || user.sessionVersion !== payload.version) return null;
  return user;
}

export async function startSession(user: User): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  (await cookies()).set(
    SESSION_COOKIE,
    signSession({ userId: user.id, version: user.sessionVersion, expiresAt }, getSessionSecret()),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(expiresAt),
    },
  );
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** For pages: the user, or a redirect to sign-in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For server actions that return a result: null when the caller is an admin,
 * otherwise the message to return. Runs before any input is read.
 */
export async function adminDenied(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return new AuthError("signed_out").message;
  return user.role === "admin" ? null : ADMIN_ONLY;
}

/** For server actions without a result shape (redirecting ones): throws unless admin. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("signed_out");
  if (user.role !== "admin") throw new AuthError("forbidden");
  return user;
}

export const isAdmin = (user: Pick<User, "role"> | null) => user?.role === ("admin" satisfies Role);
export const actorOf = (user: Pick<User, "id" | "email"> | null | undefined) =>
  user ? { id: user.id, email: user.email } : null;

export type AdminCheck = { user: User; denied?: undefined } | { user?: undefined; denied: string };

/**
 * For server actions: call first, before reading any input, and return
 * `auth.denied` when `auth.user` is missing.
 * Returns the admin (for the audit log) or the message to return.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const user = await getCurrentUser();
  if (!user) return { denied: new AuthError("signed_out").message };
  if (user.role !== "admin") return { denied: ADMIN_ONLY };
  return { user };
}

/** For read-only actions any signed-in user may call. */
export async function checkSignedIn(): Promise<AdminCheck> {
  const user = await getCurrentUser();
  return user ? { user } : { denied: new AuthError("signed_out").message };
}

/** For route handlers: the signed-in user, or a 401 response to return. */
export async function apiUser(): Promise<User | Response> {
  const user = await getCurrentUser();
  return user ?? Response.json({ error: "Sign in to continue." }, { status: 401 });
}
