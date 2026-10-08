import "server-only";
import { type ComponentPatterns, type FigmaAccount, SCHEMA_VERSION, Settings } from "@/lib/model";
import { decrypt, encrypt } from "@/lib/secrets/crypto";
import type { Secret } from "@/lib/secrets/secret";
import { readJson, writeJsonAtomic } from "./files";

const FILE = "settings.json";

async function load(): Promise<Settings> {
  return (await readJson(FILE, Settings)) ?? { schemaVersion: SCHEMA_VERSION };
}

/** Safe to send to the browser: never contains the token or its ciphertext. */
export type FigmaStatus = { connected: boolean; account?: FigmaAccount; savedAt?: string };

export async function getFigmaStatus(): Promise<FigmaStatus> {
  const s = await load();
  return {
    connected: Boolean(s.figmaToken),
    account: s.figmaAccount,
    savedAt: s.figmaTokenSavedAt,
  };
}

export async function saveFigmaToken(token: Secret, account: FigmaAccount): Promise<void> {
  const s = await load();
  await writeJsonAtomic(FILE, {
    ...s,
    figmaToken: encrypt(token),
    figmaAccount: account,
    figmaTokenSavedAt: new Date().toISOString(),
  } satisfies Settings);
}

/** The decrypted token, or null when none is saved. Throws if ENCRYPTION_KEY is missing or wrong. */
export async function getFigmaToken(): Promise<Secret | null> {
  const s = await load();
  return s.figmaToken ? decrypt(s.figmaToken) : null;
}

export async function removeFigmaToken(): Promise<void> {
  const s = await load();
  const { figmaToken: _t, figmaAccount: _a, figmaTokenSavedAt: _d, ...rest } = s;
  void _t;
  void _a;
  void _d;
  await writeJsonAtomic(FILE, rest satisfies Settings);
}

/** Saved frame-name keywords (overrides only); undefined when the defaults are in use. */
export async function getComponentPatterns(): Promise<ComponentPatterns | undefined> {
  return (await load()).componentPatterns;
}

/** Save keyword overrides, or pass undefined to go back to the defaults. */
export async function saveComponentPatterns(
  patterns: ComponentPatterns | undefined,
): Promise<void> {
  const { componentPatterns: _old, ...rest } = await load();
  void _old;
  await writeJsonAtomic(
    FILE,
    Settings.parse(patterns ? { ...rest, componentPatterns: patterns } : rest),
  );
}
