import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";
import { withTempDataDir } from "@/test/tempDataDir";
import { createUser, deleteUser, getUserByEmail, setPassword, updateUser } from "./users";

const dataDir = withTempDataDir();
const PW = "a strong passphrase";

const make = (email: string, role: "admin" | "viewer" = "admin") =>
  createUser({ email, name: email.split("@")[0], role, password: PW });

describe("users", () => {
  it("stores a scrypt hash, never the password, and finds users by email ignoring case", async () => {
    const user = await make("Ada@Example.com");
    expect(user.email).toBe("ada@example.com");
    const raw = await readFile(path.join(dataDir(), "users.json"), "utf8");
    expect(raw).not.toContain(PW);
    expect(await verifyPassword(PW, user.passwordHash)).toBe(true);
    expect((await getUserByEmail(" ADA@example.com "))?.id).toBe(user.id);
    expect(await getUserByEmail("not an email")).toBeNull();
  });

  it("refuses duplicate emails and weak passwords", async () => {
    await make("a@example.com");
    await expect(make("A@example.com")).rejects.toThrow(/already exists/);
    await expect(
      createUser({ email: "b@example.com", name: "B", role: "viewer", password: "short" }),
    ).rejects.toThrow(/at least 12/);
  });

  it("never leaves the app without an active admin", async () => {
    const a = await make("a@example.com");
    const v = await make("v@example.com", "viewer");
    await expect(updateUser(v.id, a.id, { role: "viewer" })).rejects.toThrow(
      /at least one active admin/,
    );
    await expect(updateUser(v.id, a.id, { disabled: true })).rejects.toThrow(
      /at least one active admin/,
    );
    await expect(deleteUser(v.id, a.id)).rejects.toThrow(/at least one active admin/);
  });

  it("stops admins demoting, disabling or deleting themselves", async () => {
    const a = await make("a@example.com");
    await make("b@example.com");
    await expect(updateUser(a.id, a.id, { role: "viewer" })).rejects.toThrow(/yourself/);
    await expect(updateUser(a.id, a.id, { disabled: true })).rejects.toThrow(/yourself/);
    await expect(deleteUser(a.id, a.id)).rejects.toThrow(/yourself/);
  });

  it("bumps the session version on role, status and password changes only", async () => {
    const a = await make("a@example.com");
    const v = await make("v@example.com", "viewer");
    expect((await updateUser(a.id, v.id, { name: "Renamed" })).sessionVersion).toBe(1);
    expect((await updateUser(a.id, v.id, { role: "admin" })).sessionVersion).toBe(2);
    expect((await updateUser(a.id, v.id, { disabled: true })).sessionVersion).toBe(3);
    const changed = await setPassword(v.id, "another passphrase");
    expect(changed.sessionVersion).toBe(4);
    expect(await verifyPassword("another passphrase", changed.passwordHash)).toBe(true);
  });
});
