"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit/log";
import { verifyPassword } from "@/lib/auth/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/rateLimit";
import { checkSetupCode, clearSetupCode } from "@/lib/auth/setup";
import { actorOf, endSession, getCurrentUser, startSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { SessionSecretError } from "@/lib/auth/token";
import { UserError, createUser, getUserByEmail, hasUsers } from "@/lib/storage/users";

export type AuthFormState = { error?: string; email?: string };

const GENERIC = "Email or password is incorrect.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const key = `${email}|${await clientIp()}`;

  if (isLocked(key)) return { error: "Too many attempts. Wait 15 minutes and try again.", email };
  try {
    const user = await getUserByEmail(email);
    // Always run one hash comparison so response time does not reveal whether the email exists.
    const ok = await verifyPassword(
      password,
      user?.passwordHash ??
        "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    );
    if (!user || !ok || user.disabled) {
      recordFailure(key);
      await audit(null, { action: "auth.login_failed", details: `email ${email || "(empty)"}` });
      return { error: GENERIC, email };
    }
    clearFailures(key);
    await startSession(user);
    await audit(actorOf(user), { action: "auth.login" });
  } catch (err) {
    if (err instanceof SessionSecretError) return { error: err.message, email };
    throw err;
  }
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  await endSession();
  if (user) await audit(actorOf(user), { action: "auth.logout" });
  redirect("/login");
}

export async function setupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  if (await hasUsers()) return { error: "AuthorKit is already set up. Sign in instead." };
  if (!(await checkSetupCode(String(formData.get("code") ?? "")))) {
    return { error: "That setup code is not right. Copy it from the server log.", email };
  }
  try {
    const user = await createUser({
      email,
      name: String(formData.get("name") ?? "").trim() || "Admin",
      role: "admin",
      password: String(formData.get("password") ?? ""),
    });
    clearSetupCode();
    await startSession(user);
    await audit(actorOf(user), {
      action: "user.create",
      target: { type: "user", id: user.id, name: user.email },
      details: "first admin (setup)",
    });
  } catch (err) {
    if (err instanceof UserError || err instanceof SessionSecretError)
      return { error: err.message, email };
    if (err instanceof Error && err.name === "ZodError")
      return { error: "Enter a valid email address.", email };
    throw err;
  }
  redirect("/projects");
}
