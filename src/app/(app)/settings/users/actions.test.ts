import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserByEmail, listUsers } from "@/lib/storage/users";
import { addTestUser, withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { changeOwnPasswordAction } from "../../account/actions";
import { TEST_PASSWORD } from "@/test/session";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  updateUserAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const dataDir = withTempDataDir();
const me = withSignedIn("admin");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const log = async () => readFile(path.join(dataDir(), "audit.log"), "utf8");

describe("user management", () => {
  it("adds users, logging the change but not the password", async () => {
    const result = await createUserAction(
      {},
      form({
        name: "Vic",
        email: "vic@example.com",
        role: "viewer",
        password: "temporary passphrase",
      }),
    );
    expect(result.ok).toMatch(/User added/);
    expect(await getUserByEmail("vic@example.com")).toMatchObject({
      role: "viewer",
      disabled: false,
    });
    const text = await log();
    expect(text).toContain('"action":"user.create"');
    expect(text).not.toContain("temporary passphrase");
  });

  it("explains invalid input", async () => {
    expect(
      (
        await createUserAction(
          {},
          form({ name: "X", email: "nope", role: "viewer", password: "x" }),
        )
      ).error,
    ).toMatch(/valid email/);
    expect(
      (
        await createUserAction(
          {},
          form({ name: "X", email: "x@example.com", role: "owner", password: "long enough pass" }),
        )
      ).error,
    ).toBeTruthy();
  });

  it("changes roles and status, but not your own", async () => {
    const v = await addTestUser("viewer");
    expect(await updateUserAction(v.id, { role: "admin" })).toEqual({ ok: true });
    expect(await updateUserAction(v.id, { disabled: true })).toEqual({ ok: true });
    expect(await updateUserAction(me().id, { role: "viewer" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/yourself/),
    });
    expect(await updateUserAction(v.id, { passwordHash: "scrypt$x" })).toEqual({
      ok: false,
      error: "Invalid change.",
    });
  });

  it("resets passwords and deletes users", async () => {
    const v = await addTestUser("viewer");
    expect(await resetPasswordAction(v.id, "short")).toMatchObject({ ok: false });
    expect(await resetPasswordAction(v.id, "a fresh passphrase")).toEqual({ ok: true });
    expect(await deleteUserAction(v.id)).toEqual({ ok: true });
    expect(await deleteUserAction(me().id)).toMatchObject({ ok: false });
    expect((await listUsers()).map((u) => u.id)).toEqual([me().id]);
  });
});

describe("own password", () => {
  it("needs the current password and keeps this browser signed in", async () => {
    const wrong = await changeOwnPasswordAction(
      {},
      form({ current: "not it at all", password: "new passphrase!", confirm: "new passphrase!" }),
    );
    expect(wrong.error).toMatch(/current password/);
    const mismatch = await changeOwnPasswordAction(
      {},
      form({ current: TEST_PASSWORD, password: "new passphrase!", confirm: "different one!!" }),
    );
    expect(mismatch.error).toMatch(/do not match/);
    const ok = await changeOwnPasswordAction(
      {},
      form({ current: TEST_PASSWORD, password: "new passphrase!", confirm: "new passphrase!" }),
    );
    expect(ok.ok).toMatch(/Password changed/);
    expect((await getCurrentUser())?.sessionVersion).toBe(2);
  });
});
