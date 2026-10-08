"use server";

import { audit } from "@/lib/audit/log";
import { verifyPassword } from "@/lib/auth/password";
import { actorOf, checkSignedIn, startSession } from "@/lib/auth/session";
import { UserError, setPassword } from "@/lib/storage/users";

export type PasswordState = { error?: string; ok?: string };

/** Any signed-in user may change their own password; other sessions are signed out. */
export async function changeOwnPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const auth = await checkSignedIn();
  if (!auth.user) return { error: auth.denied };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (next !== String(formData.get("confirm") ?? ""))
    return { error: "The new passwords do not match." };
  if (!(await verifyPassword(current, auth.user.passwordHash)))
    return { error: "Your current password is not right." };
  try {
    const user = await setPassword(auth.user.id, next);
    // Keep this browser signed in with the new session version.
    await startSession(user);
    await audit(actorOf(user), {
      action: "user.password_change",
      target: { type: "user", id: user.id, name: user.email },
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
  return { ok: "Password changed. Other browsers have been signed out." };
}
