import type { LLMProvider, MappingRequest, MappingSuggestion } from "@/lib/llm/provider";
import { LLMError, type LLMErrorCode } from "@/lib/llm/provider";

/** Returns canned suggestions (or a function of the request) and records each request. */
export class MockLLMProvider implements LLMProvider {
  readonly name = "Mock";
  readonly requests: MappingRequest[] = [];
  constructor(
    private readonly answer:
      | MappingSuggestion[]
      | ((r: MappingRequest) => MappingSuggestion[])
      | { fail: LLMErrorCode } = [],
  ) {}
  async suggestMappings(request: MappingRequest): Promise<MappingSuggestion[]> {
    this.requests.push(request);
    if ("fail" in this.answer) throw new LLMError(this.answer.fail);
    return typeof this.answer === "function" ? this.answer(request) : this.answer;
  }
}
