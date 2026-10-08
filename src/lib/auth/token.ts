import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Not encrypted (the payload is only ids and times); the signature stops tampering.
 * Pure and dependency-free so both the proxy and the app can use it.
 */
export type SessionPayload = { userId: string; version: number; expiresAt: number };

export const SESSION_COOKIE = "ak_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const b64 = (data: Buffer | string) => Buffer.from(data).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(sign(body, secret))}`;
}

/** The payload when the signature is valid and the token has not expired, else null. */
export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.version !== "number" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }
    return payload.expiresAt > now ? payload : null;
  } catch {
    return null;
  }
}

export class SessionSecretError extends Error {}

export const SECRET_HELP =
  "Set SESSION_SECRET in .env to at least 32 random bytes. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";

export function getSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret === "replace-me" || Buffer.byteLength(secret) < 32) {
    throw new SessionSecretError(`SESSION_SECRET is missing or too short. ${SECRET_HELP}`);
  }
  return secret;
}
