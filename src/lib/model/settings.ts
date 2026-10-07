import { z } from "zod";
import { SchemaVersion } from "./common";

/** AES-256-GCM payload, all base64. Encryption itself arrives with the Figma integration (Prompt 7). */
export const EncryptedSecret = z.object({
  iv: z.base64(),
  ciphertext: z.base64(),
  tag: z.base64(),
});

export const Settings = z.object({
  schemaVersion: SchemaVersion,
  figmaToken: EncryptedSecret.optional(),
});
export type Settings = z.infer<typeof Settings>;
