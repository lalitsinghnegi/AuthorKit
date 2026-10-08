import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, getEncryptionKey, isEncryptionConfigured } from "./crypto";
import { Secret } from "./secret";

const key = () => randomBytes(32);
const TOKEN = "figd_super-secret-token-value";

describe("Secret", () => {
  it("never shows its value when printed or serialised", () => {
    const s = new Secret(TOKEN);
    expect(String(s)).toBe("[redacted]");
    expect(`${s}`).toBe("[redacted]");
    expect(JSON.stringify({ s })).toBe('{"s":"[redacted]"}');
    expect(inspect(s)).toBe("Secret([redacted])");
    expect(inspect({ nested: s }, { depth: 5 })).not.toContain(TOKEN);
    expect(Object.keys(s)).toEqual([]);
    expect(s.reveal()).toBe(TOKEN);
  });
});

describe("encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const k = key();
    const a = encrypt(new Secret(TOKEN), k);
    const b = encrypt(new Secret(TOKEN), k);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain(TOKEN);
    expect(decrypt(a, k).reveal()).toBe(TOKEN);
  });

  it("fails with the wrong key or tampered data", () => {
    const k = key();
    const enc = encrypt(new Secret(TOKEN), k);
    expect(() => decrypt(enc, key())).toThrow();
    const flipped = Buffer.from(enc.ciphertext, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt({ ...enc, ciphertext: flipped.toString("base64") }, k)).toThrow();
    expect(() => decrypt({ ...enc, tag: Buffer.alloc(16).toString("base64") }, k)).toThrow();
  });

  it("explains how to set ENCRYPTION_KEY when it is missing or malformed", () => {
    expect(() => getEncryptionKey({})).toThrow(/ENCRYPTION_KEY is not set.*randomBytes\(32\)/);
    expect(() => getEncryptionKey({ ENCRYPTION_KEY: "replace-me" })).toThrow(/not set/);
    expect(() => getEncryptionKey({ ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /32 bytes/,
    );
    expect(isEncryptionConfigured({ ENCRYPTION_KEY: key().toString("base64") })).toBe(true);
    expect(isEncryptionConfigured({})).toBe(false);
  });
});
