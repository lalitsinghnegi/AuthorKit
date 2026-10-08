"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SaveResult } from "@/lib/actions/result";
import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { Email, Role } from "@/lib/model";
import { UserError, createUser, deleteUser, setPassword, updateUser } from "@/lib/storage/users";

export type UserFormState = { error?: string; ok?: string };

const NewUser = z.object({
  email: Email,
  name: z.string().trim().min(1, "Enter a name").max(80),
  role: Role,
  password: z.string().max(200),
});

const message = (err: unknown): string => {
  if (err instanceof UserError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Check the form.";
  throw err;
};

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const auth = await checkAdmin();
  if (!auth.user) return { error: auth.denied };
  try {
    const input = NewUser.parse({
      email: formData.get("email"),
      name: formData.get("name"),
      role: formData.get("role"),
      password: formData.get("password"),
    });
    const user = await createUser(input);
    await audit(actorOf(auth.user), {
      action: "user.create",
      target: { type: "user", id: user.id, name: user.email },
      details: `role ${user.role}`,
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/settings/users");
  return { ok: "User added. Share the temporary password with them privately." };
}

const Change = z.object({ role: Role.optional(), disabled: z.boolean().optional() }).strict();

export async function updateUserAction(id: string, change: unknown): Promise<SaveResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const parsed = Change.safeParse(change);
  if (!parsed.success) return { ok: false, error: "Invalid change." };
  try {
    const user = await updateUser(auth.user.id, String(id), parsed.data);
    const details = [
      parsed.data.role && `role ${parsed.data.role}`,
      parsed.data.disabled !== undefined && (parsed.data.disabled ? "disabled" : "enabled"),
    ]
      .filter(Boolean)
      .join(", ");
    await audit(actorOf(auth.user), {
      action: "user.update",
      target: { type: "user", id: user.id, name: user.email },
      details,
    });
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function resetPasswordAction(id: string, password: string): Promise<SaveResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  try {
    const user = await setPassword(String(id), String(password ?? ""));
    await audit(actorOf(auth.user), {
      action: "user.password_reset",
      target: { type: "user", id: user.id, name: user.email },
    });
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  return { ok: true };
}

export async function deleteUserAction(id: string): Promise<SaveResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  try {
    const user = await deleteUser(auth.user.id, String(id));
    await audit(actorOf(auth.user), {
      action: "user.delete",
      target: { type: "user", id: user.id, name: user.email },
    });
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  revalidatePath("/settings/users");
  return { ok: true };
}
