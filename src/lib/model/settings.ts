import { z } from "zod";
import { SchemaVersion } from "./common";

/** AES-256-GCM payload, all base64. See src/lib/secrets/crypto.ts. */
export const EncryptedSecret = z.object({
  iv: z.base64(),
  ciphertext: z.base64(),
  tag: z.base64(),
});

/** The Figma account a token belongs to, from /v1/me. Shown instead of any part of the token. */
export const FigmaAccount = z.object({
  id: z.string(),
  handle: z.string(),
  email: z.string().optional(),
});
export type FigmaAccount = z.infer<typeof FigmaAccount>;

export const Settings = z.object({
  schemaVersion: SchemaVersion,
  figmaToken: EncryptedSecret.optional(),
  figmaAccount: FigmaAccount.optional(),
  figmaTokenSavedAt: z.iso.datetime().optional(),
});
export type Settings = z.infer<typeof Settings>;
