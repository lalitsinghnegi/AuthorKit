import "server-only";
import { Secret } from "@/lib/secrets/secret";
import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./provider";

/** The configured provider, or null when AI suggestions are switched off (no ANTHROPIC_API_KEY). */
export function getLLMProvider(
  env: Record<string, string | undefined> = process.env,
): LLMProvider | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new AnthropicProvider(new Secret(key));
}

export const isLLMConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.ANTHROPIC_API_KEY?.trim());
