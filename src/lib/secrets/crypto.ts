import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { z } from "zod";
import type { EncryptedSecret } from "@/lib/model/settings";
import { Secret } from "./secret";

type Encrypted = z.infer<typeof EncryptedSecret>;

export class EncryptionKeyError extends Error {}

export const KEY_HELP =
  "Set ENCRYPTION_KEY in .env to 32 random bytes in base64. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";

/** The AES-256 key from ENCRYPTION_KEY, or a setup error explaining how to create one. */
export function getEncryptionKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.ENCRYPTION_KEY?.trim();
  if (!raw || raw === "replace-me")
    throw new EncryptionKeyError(`ENCRYPTION_KEY is not set. ${KEY_HELP}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new EncryptionKeyError(`ENCRYPTION_KEY must decode to 32 bytes. ${KEY_HELP}`);
  return key;
}

export function isEncryptionConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    getEncryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM with a fresh random 96-bit IV per call. */
export function encrypt(secret: Secret, key = getEncryptionKey()): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret.reveal(), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws if the key is wrong or the data was tampered with (GCM authentication). */
export function decrypt(data: Encrypted, key = getEncryptionKey()): Secret {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, "base64")),
    decipher.final(),
  ]);
  return new Secret(plain.toString("utf8"));
}
