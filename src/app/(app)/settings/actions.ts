"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { HttpFigmaClient } from "@/lib/figma/client";
import { FigmaError } from "@/lib/figma/errors";
import { getFigmaClient } from "@/lib/figma/server";
import { KEY_HELP, isEncryptionConfigured } from "@/lib/secrets/crypto";
import { Secret } from "@/lib/secrets/secret";
import {
  getFigmaStatus,
  removeFigmaToken,
  saveFigmaToken,
  type FigmaStatus,
} from "@/lib/storage/settings";

export type SettingsResult =
  | { ok: true; message: string; status: FigmaStatus }
  | { ok: false; error: string; status?: FigmaStatus };

const friendly = (err: unknown): string => {
  if (err instanceof FigmaError) return err.message;
  // Anything else may carry details we do not want to show; keep it generic.
  return "Something went wrong while talking to Figma.";
};

/** Verify the token with Figma first; only a token Figma accepts is stored. */
export async function saveFigmaTokenAction(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const raw = String(formData.get("token") ?? "").trim();
  if (!raw) return { ok: false, error: "Paste a Figma personal access token." };
  if (raw.length > 300 || /\s/.test(raw))
    return { ok: false, error: "That does not look like a Figma token." };
  if (!isEncryptionConfigured()) return { ok: false, error: KEY_HELP };

  const token = new Secret(raw);
  try {
    const me = await new HttpFigmaClient(token, { cache: new Map() }).getMe();
    const account = { id: String(me.id), handle: me.handle, email: me.email };
    await saveFigmaToken(token, account);
    await audit(actorOf(auth.user), {
      action: "settings.figma_token_saved",
      details: `account ${me.handle}`,
    });
    return { ok: true, message: `Connected as ${me.handle}.`, status: await getFigmaStatus() };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function testFigmaConnectionAction(): Promise<SettingsResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  try {
    const me = await (await getFigmaClient()).getMe();
    return {
      ok: true,
      message: `Connection works. Signed in to Figma as ${me.handle}.`,
      status: await getFigmaStatus(),
    };
  } catch (err) {
    if (
      !(err instanceof FigmaError) &&
      err instanceof Error &&
      err.message.includes("ENCRYPTION_KEY")
    ) {
      return {
        ok: false,
        error:
          "The saved token cannot be decrypted. ENCRYPTION_KEY may have changed; save the token again.",
      };
    }
    return { ok: false, error: friendly(err), status: await getFigmaStatus() };
  }
}

export async function removeFigmaTokenAction(): Promise<SettingsResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  await removeFigmaToken();
  await audit(actorOf(auth.user), { action: "settings.figma_token_removed" });
  return { ok: true, message: "Figma token removed.", status: await getFigmaStatus() };
}
