import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { hasUsers } from "@/lib/storage/users";

/** No 0/O or 1/I/L, so the code is easy to copy from a terminal. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type SetupState = { code?: string };
const state: SetupState = ((globalThis as { __akSetup?: SetupState }).__akSetup ??= {});

/**
 * The one-time code for creating the first admin. Only exists while there are
 * no users; generated on first need and printed to the server log, never shown
 * in the browser.
 */
export async function ensureSetupCode(
  log: (msg: string) => void = console.log,
): Promise<string | null> {
  if (await hasUsers()) {
    state.code = undefined;
    return null;
  }
  if (!state.code) {
    state.code = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    log(
      `\n  AuthorKit has no users yet. Open /setup and enter this setup code:\n\n      ${state.code}\n`,
    );
  }
  return state.code;
}

export async function checkSetupCode(input: string): Promise<boolean> {
  const code = await ensureSetupCode();
  if (!code) return false;
  const a = Buffer.from(input.trim().toUpperCase());
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearSetupCode(): void {
  state.code = undefined;
}
