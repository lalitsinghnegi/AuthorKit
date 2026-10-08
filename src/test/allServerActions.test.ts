/**
 * Every exported server action must refuse viewers and signed-out callers
 * before touching anything. New actions are picked up automatically, so an
 * action added without the admin check fails here.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ONLY } from "@/lib/auth/session";
import { jar, signInAs } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`unexpected redirect to ${to}`);
  },
  notFound: () => {
    throw new Error("unexpected notFound");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const APP = path.resolve(import.meta.dirname, "../app");

/** Actions anyone may call (sign-in itself) or any signed-in user may call. */
const PUBLIC = new Set(["loginAction", "logoutAction", "setupAction"]);
const ANY_SIGNED_IN = new Set(["loadPreviewsAction", "changeOwnPasswordAction"]);

async function serverActionFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await serverActionFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      if ((await readFile(full, "utf8")).startsWith('"use server"')) out.push(full);
    }
  }
  return out;
}

const files = await serverActionFiles(APP);
const actions: { name: string; file: string; fn: (...args: unknown[]) => Promise<unknown> }[] = [];
for (const file of files) {
  const mod = (await import(file)) as Record<string, unknown>;
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn === "function")
      actions.push({ name, file: path.relative(APP, file), fn: fn as never });
  }
}

/** Arguments shaped like every action's parameters: ids, payloads and FormData. */
function args(): unknown[] {
  const form = new FormData();
  form.set("name", "Hacked");
  form.set("email", "x@example.com");
  form.set("password", "a-long-enough-password");
  return ["some-id", form, form];
}

/** A refusal is a returned error that mentions access, or a thrown AuthError. */
async function expectRefused(fn: (...a: unknown[]) => Promise<unknown>, message: RegExp) {
  let result: unknown;
  try {
    result = await fn(...args());
  } catch (err) {
    expect((err as Error).name, String(err)).toBe("AuthError");
    expect((err as Error).message).toMatch(message);
    return;
  }
  expect(JSON.stringify(result)).toMatch(message);
}

async function snapshot(dir: string): Promise<string> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name !== "audit.log")
        out.push(`${path.relative(dir, full)}:${await readFile(full, "utf8")}`);
    }
  };
  await walk(dir);
  return out.sort().join("\n");
}

const dataDir = withTempDataDir();

describe("server action access control", () => {
  it("finds the server actions", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
    expect(actions.length).toBeGreaterThanOrEqual(35);
  });

  const guarded = actions.filter((a) => !PUBLIC.has(a.name));

  describe("as a viewer", () => {
    beforeEach(async () => {
      await signInAs("viewer");
    });
    it.each(guarded.filter((a) => !ANY_SIGNED_IN.has(a.name)).map((a) => [a.name, a]))(
      "%s refuses and changes nothing",
      async (_name, a) => {
        const before = await snapshot(dataDir());
        await expectRefused(a.fn, new RegExp(ADMIN_ONLY.replace(/\./g, "\\.")));
        expect(await snapshot(dataDir())).toBe(before);
      },
    );
  });

  describe("signed out", () => {
    beforeEach(() => {
      jar.cookies.clear();
    });
    it.each(guarded.map((a) => [a.name, a]))("%s refuses and changes nothing", async (_name, a) => {
      const before = await snapshot(dataDir());
      await expectRefused(a.fn, /Sign in again/);
      expect(await snapshot(dataDir())).toBe(before);
    });
  });
});
