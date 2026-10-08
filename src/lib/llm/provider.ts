import { z } from "zod";
import type { CandidateFrame } from "@/lib/mapping/detect";
import { MAPPABLE_COMPONENTS, type MappableComponent } from "@/lib/mapping/patterns";

/** What an LLM is asked: frames by name and shape, and the components they may map to. */
export type MappingRequest = {
  frames: Pick<
    CandidateFrame,
    "nodeId" | "nodeName" | "path" | "childNames" | "width" | "height"
  >[];
  components: { id: MappableComponent; name: string; description: string }[];
};

export type MappingSuggestion = {
  nodeId: string;
  componentId: MappableComponent | null;
  confidence: "high" | "low";
  reason: string;
};

/** Anything that can suggest frame → component mappings. Suggestions are never applied automatically. */
export interface LLMProvider {
  readonly name: string;
  suggestMappings(request: MappingRequest): Promise<MappingSuggestion[]>;
}

export type LLMErrorCode =
  "auth" | "rate_limited" | "unavailable" | "refused" | "invalid_output" | "too_large";

const MESSAGES: Record<LLMErrorCode, string> = {
  auth: "The AI provider rejected the API key. Check ANTHROPIC_API_KEY.",
  rate_limited: "The AI provider is rate-limiting requests. Try again in a minute.",
  unavailable: "The AI provider could not be reached. Try again shortly.",
  refused: "The AI provider declined this request.",
  invalid_output: "The AI provider returned an unexpected answer; no suggestions were applied.",
  too_large: "Too many frames to send at once; detect frames per link instead.",
};

/** Fixed, safe messages: never includes keys, request bodies or provider responses. */
export class LLMError extends Error {
  constructor(readonly code: LLMErrorCode) {
    super(MESSAGES[code]);
    this.name = "LLMError";
  }
}

export const MAX_FRAMES = 200;

/** "none" stands for "not a component" in the structured output, since enums cannot hold null. */
export const NONE = "none";

export const SuggestionResponse = z.object({
  suggestions: z.array(
    z.object({
      nodeId: z.string(),
      componentId: z.enum([...MAPPABLE_COMPONENTS, NONE]),
      confidence: z.enum(["high", "low"]),
      reason: z.string(),
    }),
  ),
});

/** JSON schema for the structured output; mirrors SuggestionResponse. */
export const SUGGESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nodeId", "componentId", "confidence", "reason"],
        properties: {
          nodeId: { type: "string" },
          componentId: { type: "string", enum: [...MAPPABLE_COMPONENTS, NONE] },
          confidence: { type: "string", enum: ["high", "low"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Check raw provider output: it must match the schema, and only frames that
 * were asked about are kept (one suggestion each). Reasons are trimmed.
 */
export function validateSuggestions(raw: unknown, request: MappingRequest): MappingSuggestion[] {
  const parsed = SuggestionResponse.safeParse(raw);
  if (!parsed.success) throw new LLMError("invalid_output");
  const asked = new Set(request.frames.map((f) => f.nodeId));
  const seen = new Set<string>();
  const out: MappingSuggestion[] = [];
  for (const s of parsed.data.suggestions) {
    if (!asked.has(s.nodeId) || seen.has(s.nodeId)) continue;
    seen.add(s.nodeId);
    out.push({
      nodeId: s.nodeId,
      componentId: s.componentId === NONE ? null : s.componentId,
      confidence: s.confidence,
      reason: s.reason.replace(/\s+/g, " ").trim().slice(0, 300),
    });
  }
  return out;
}
