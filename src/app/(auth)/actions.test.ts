import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { clearSetupCode, ensureSetupCode } from "@/lib/auth/setup";
import { MAX_FAILURES, resetThrottle } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { listUsers, setPassword, updateUser } from "@/lib/storage/users";
import { TEST_PASSWORD, addTestUser, jar, setSessionCookie } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { loginAction, logoutAction, setupAction } from "./actions";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

const dataDir = withTempDataDir();
const auditLines = async () =>
  (await readFile(path.join(dataDir(), "audit.log"), "utf8").catch(() => ""))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** Run an action that redirects on success; returns the redirect target or the returned state. */
async function run<T>(p: Promise<T>): Promise<{ to: string } | T> {
  try {
    return await p;
  } catch (err) {
    if ((err as Error).message === "NEXT_REDIRECT") return { to: (err as { to: string }).to };
    throw err;
  }
}

beforeEach(() => {
  resetThrottle();
  clearSetupCode();
});

describe("login", () => {
  it("signs in with the right password, sets a session cookie and logs it", async () => {
    const user = await addTestUser("admin", { email: "ada@example.com" });
    const result = await run(
      loginAction(
        {},
        form({ email: "ADA@example.com", password: TEST_PASSWORD, next: "/projects/x" }),
      ),
    );
    expect(result).toEqual({ to: "/projects/x" });
    expect(jar.cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect((await getCurrentUser())?.id).toBe(user.id);
    expect((await auditLines()).at(-1)).toMatchObject({
      action: "auth.login",
      actor: { email: "ada@example.com" },
    });
  });

  it("ignores an off-site next parameter", async () => {
    await addTestUser("admin", { email: "ada@example.com" });
    const result = await run(
      loginAction(
        {},
        form({ email: "ada@example.com", password: TEST_PASSWORD, next: "//evil.example" }),
      ),
    );
    expect(result).toEqual({ to: "/projects" });
  });

  it("gives the same answer for a wrong password, an unknown email and a disabled user", async () => {
    await addTestUser("admin", { email: "ada@example.com" });
    await addTestUser("viewer", { email: "off@example.com", disabled: true });
    const a = await loginAction(
      {},
      form({ email: "ada@example.com", password: "wrong password!" }),
    );
    const b = await loginAction({}, form({ email: "nobody@example.com", password: TEST_PASSWORD }));
    const c = await loginAction({}, form({ email: "off@example.com", password: TEST_PASSWORD }));
    expect(a.error).toBe("Email or password is incorrect.");
    expect(b.error).toBe(a.error);
    expect(c.error).toBe(a.error);
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    const failed = (await auditLines()).filter((e) => e.action === "auth.login_failed");
    expect(failed).toHaveLength(3);
    expect(JSON.stringify(failed)).not.toContain("wrong password");
  });

  it("locks out after repeated failures, even with the right password", async () => {
    await addTestUser("admin", { email: "ada@example.com" });
    jar.headers.set("x-forwarded-for", "203.0.113.9");
    for (let i = 0; i < MAX_FAILURES; i++)
      await loginAction({}, form({ email: "ada@example.com", password: "nope nope nope" }));
    const locked = await loginAction(
      {},
      form({ email: "ada@example.com", password: TEST_PASSWORD }),
    );
    expect(locked.error).toMatch(/Too many attempts/);
    // A different address is not affected.
    jar.headers.set("x-forwarded-for", "198.51.100.1");
    expect(
      await run(loginAction({}, form({ email: "ada@example.com", password: TEST_PASSWORD }))),
    ).toEqual({
      to: "/projects",
    });
  });
});

describe("sessions", () => {
  it("are revoked by role, status and password changes", async () => {
    const admin = await addTestUser("admin");
    const user = await addTestUser("viewer");
    setSessionCookie(user);
    expect((await getCurrentUser())?.id).toBe(user.id);
    await updateUser(admin.id, user.id, { role: "admin" });
    expect(await getCurrentUser()).toBeNull();

    setSessionCookie((await listUsers()).find((u) => u.id === user.id)!);
    expect(await getCurrentUser()).not.toBeNull();
    await setPassword(user.id, "brand new passphrase");
    expect(await getCurrentUser()).toBeNull();

    const fresh = (await listUsers()).find((u) => u.id === user.id)!;
    setSessionCookie(fresh);
    await updateUser(admin.id, user.id, { disabled: true });
    expect(await getCurrentUser()).toBeNull();
  });

  it("logout clears the cookie and is logged", async () => {
    const user = await addTestUser("viewer");
    setSessionCookie(user);
    expect(await run(logoutAction())).toEqual({ to: "/login" });
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    expect((await auditLines()).at(-1)).toMatchObject({
      action: "auth.logout",
      actor: { id: user.id },
    });
  });
});

describe("first-time setup", () => {
  const details = { name: "Ada", email: "ada@example.com", password: "a strong passphrase" };

  it("needs the setup code from the server log", async () => {
    const logged: string[] = [];
    const code = await ensureSetupCode((m) => logged.push(m));
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{12}$/);
    expect(logged.join()).toContain(code);

    expect((await setupAction({}, form({ ...details, code: "WRONG" }))).error).toMatch(
      /setup code/,
    );
    expect(await listUsers()).toHaveLength(0);

    expect(await run(setupAction({}, form({ ...details, code: code!.toLowerCase() })))).toEqual({
      to: "/projects",
    });
    const [admin] = await listUsers();
    expect(admin).toMatchObject({ email: "ada@example.com", role: "admin" });
    expect((await getCurrentUser())?.id).toBe(admin.id);
  });

  it("is closed once a user exists", async () => {
    await addTestUser("admin");
    expect(await ensureSetupCode(() => {})).toBeNull();
    expect((await setupAction({}, form({ ...details, code: "ANYTHING" }))).error).toMatch(
      /already set up/,
    );
    expect(await listUsers()).toHaveLength(1);
  });
});
