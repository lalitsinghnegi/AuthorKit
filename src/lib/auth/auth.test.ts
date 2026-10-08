import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import {
  MAX_FAILURES,
  WINDOW_MS,
  clearFailures,
  isLocked,
  recordFailure,
  resetThrottle,
} from "./rateLimit";
import { getSessionSecret, signSession, verifySession } from "./token";
import { safeNext } from "./next";

const SECRET = "x".repeat(40);

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password!")).not.toBe(await hashPassword("same password!"));
  });

  it("rejects malformed hashes without throwing", async () => {
    for (const bad of [
      "",
      "plain",
      "bcrypt$x",
      "scrypt$1$1$1$$",
      "scrypt$99999999$8$1$AA==$AA==",
    ]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("applies the password policy", () => {
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("ada@example.com", "Ada@Example.com")).toMatch(/email/);
    expect(passwordProblem("a".repeat(201))).toMatch(/at most/);
    expect(passwordProblem("twelve chars")).toBeNull();
  });
});

describe("session tokens", () => {
  const payload = { userId: "u1", version: 3, expiresAt: Date.now() + 60_000 };

  it("round-trips a signed payload", () => {
    expect(verifySession(signSession(payload, SECRET), SECRET)).toEqual(payload);
  });

  it("rejects tampering, a wrong secret, expiry and junk", () => {
    const token = signSession(payload, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, userId: "admin" })).toString(
      "base64url",
    );
    expect(verifySession(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifySession(`${body}.${sig.slice(0, -2)}AA`, SECRET)).toBeNull();
    expect(verifySession(token, "y".repeat(40))).toBeNull();
    expect(verifySession(token, SECRET, payload.expiresAt + 1)).toBeNull();
    for (const junk of [undefined, "", "abc", "a.b.c", "."])
      expect(verifySession(junk, SECRET)).toBeNull();
  });

  it("requires a long SESSION_SECRET", () => {
    expect(() => getSessionSecret({})).toThrow(/SESSION_SECRET is missing/);
    expect(() => getSessionSecret({ SESSION_SECRET: "replace-me" })).toThrow(/randomBytes/);
    expect(() => getSessionSecret({ SESSION_SECRET: "short" })).toThrow();
    expect(getSessionSecret({ SESSION_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("login throttle", () => {
  it("locks a key after repeated failures until the window passes", () => {
    resetThrottle();
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(isLocked("a|ip", t)).toBe(false);
      recordFailure("a|ip", t);
    }
    expect(isLocked("a|ip", t + 1)).toBe(true);
    expect(isLocked("b|ip", t + 1)).toBe(false);
    expect(isLocked("a|ip", t + WINDOW_MS + 1)).toBe(false);
  });

  it("clears on success", () => {
    resetThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("c|ip");
    clearFailures("c|ip");
    expect(isLocked("c|ip")).toBe(false);
  });
});

describe("safeNext", () => {
  it.each([
    ["/projects/abc?x=1", "/projects/abc?x=1"],
    ["https://evil.example", "/projects"],
    ["//evil.example", "/projects"],
    ["/\\evil.example", "/projects"],
    [undefined, "/projects"],
    [["/a"], "/projects"],
  ])("%j -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
