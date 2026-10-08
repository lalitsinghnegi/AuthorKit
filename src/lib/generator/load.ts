import "server-only";
import { getResponsive, getTokens } from "@/lib/storage/projects";
import type { GenerationInputs } from "./generate";

/** The saved Figma-derived inputs for a project (tokens.json and responsive.json). */
export async function loadGenerationInputs(projectId: string): Promise<GenerationInputs> {
  const [tokens, responsive] = await Promise.all([getTokens(projectId), getResponsive(projectId)]);
  return { tokens, responsive };
}
