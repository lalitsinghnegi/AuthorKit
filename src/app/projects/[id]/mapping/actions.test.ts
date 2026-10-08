import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@/lib/llm/provider";
import { FigmaError } from "@/lib/figma/errors";
import type { FigmaLink } from "@/lib/model";
import { createProject, getProject, updateProject } from "@/lib/storage/projects";
import { saveComponentPatterns } from "@/lib/storage/settings";
import { FIXTURE_FILE_KEY, FIXTURE_URL, MockFigmaClient } from "@/test/figma/mockClient";
import { MockLLMProvider } from "@/test/llm";
import { withTempDataDir } from "@/test/tempDataDir";

let connected = true;
let figma: MockFigmaClient;
vi.mock("@/lib/figma/server", () => ({
  getFigmaClient: async () => {
    if (!connected) throw new FigmaError("no_token");
    return figma;
  },
}));
let provider: LLMProvider | null = null;
vi.mock("@/lib/llm/server", () => ({
  getLLMProvider: () => provider,
  isLLMConfigured: () => provider !== null,
}));

const { detectFramesAction, loadPreviewsAction, saveMappingsAction, suggestWithAIAction } =
  await import("./actions");

withTempDataDir();

beforeEach(() => {
  connected = true;
  figma = new MockFigmaClient();
  provider = null;
});

const link = (id: string, patch: Partial<FigmaLink>): FigmaLink => ({
  id,
  label: id,
  scope: "page",
  pageName: "Home",
  url: FIXTURE_URL,
  fileKey: FIXTURE_FILE_KEY,
  ...patch,
});

async function project(links: FigmaLink[]) {
  const p = await createProject({
    name: "P",
    brandName: "Acme",
    prefix: "acme",
    approach: "mobile-first",
  });
  await updateProject(p.id, (x) => ({ ...x, figmaLinks: links }));
  return p.id;
}

const mapping = (links: FigmaLink[], nodeId: string) =>
  links.flatMap((l) => l.mappings ?? []).find((m) => m.nodeId === nodeId)!;

describe("detectFramesAction", () => {
  it("detects frames in linked nodes, suggests from names and notes whole-file links", async () => {
    const id = await project([
      link("home", { nodeId: "4:1" }),
      link("btn", { scope: "component", pageName: undefined, nodeId: "3:1", componentId: "cta" }),
      link("file", { scope: "global", pageName: undefined }),
    ]);
    const result = await detectFramesAction(id);
    if (!result.ok) throw new Error(result.error);
    expect(result.notes).toEqual([
      "“file” links to a whole file. Select a frame in Figma and copy its link to detect components.",
    ]);
    expect(figma.calls.map((c) => [c.method, c.args[1]])).toEqual([["getNodes", ["4:1", "3:1"]]]);

    expect(mapping(result.links, "4:10")).toMatchObject({
      componentId: "header",
      state: "suggested",
      source: "pattern",
    });
    expect(mapping(result.links, "4:13")).toMatchObject({
      componentId: null,
      reason: "No name pattern matches",
    });
    // A component link's own frame is confirmed from the link.
    expect(mapping(result.links, "3:1")).toMatchObject({
      componentId: "cta",
      state: "confirmed",
      source: "manual",
    });
    expect((await getProject(id))!.figmaLinks).toEqual(result.links);
  });

  it("uses saved name patterns", async () => {
    await saveComponentPatterns({ accordion: ["frame 12"] });
    const id = await project([link("home", { nodeId: "4:1" })]);
    const result = await detectFramesAction(id);
    expect(result.ok && mapping(result.links, "4:13")).toMatchObject({
      componentId: "accordion",
      confidence: "high",
    });
  });

  it("keeps decisions on re-detection", async () => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    await saveMappingsAction(id, [
      { linkId: "home", nodeId: "4:13", componentId: "accordion", state: "confirmed" },
      { linkId: "home", nodeId: "4:11", componentId: null, state: "ignored" },
    ]);
    const again = await detectFramesAction(id);
    if (!again.ok) throw new Error(again.error);
    expect(mapping(again.links, "4:13")).toMatchObject({
      componentId: "accordion",
      state: "confirmed",
      source: "manual",
    });
    expect(mapping(again.links, "4:11").state).toBe("ignored");
  });

  it("explains missing token and missing links", async () => {
    expect(await detectFramesAction(await project([]))).toEqual({
      ok: false,
      error: "Add Figma links first (Figma).",
    });
    connected = false;
    expect(await detectFramesAction(await project([link("a", { nodeId: "4:1" })]))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No Figma token/),
    });
  });
});

describe("loadPreviewsAction", () => {
  it("renders previews for mapped frames, skipping ignored ones", async () => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    await saveMappingsAction(id, [
      { linkId: "home", nodeId: "4:11", componentId: null, state: "ignored" },
    ]);
    figma.calls.length = 0;
    const result = await loadPreviewsAction(id);
    if (!result.ok) throw new Error(result.error);
    const [call] = figma.calls;
    expect(call.method).toBe("getImages");
    expect(call.args[1]).not.toContain("4:11");
    expect(call.args[2]).toEqual({ format: "png", scale: 0.5 });
    expect(result.images["4:10"]).toBe(
      "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4-10.png",
    );
    expect(result.images["4:100"]).toBeUndefined();
  });
});

describe("suggestWithAIAction", () => {
  it("is off without a provider", async () => {
    expect(await suggestWithAIAction(await project([]))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/ANTHROPIC_API_KEY/),
    });
  });

  it("sends only ambiguous frames and stores answers as suggestions", async () => {
    const mock = new MockLLMProvider((r) =>
      r.frames.map((f) => ({
        nodeId: f.nodeId,
        componentId: f.nodeName === "Frame 12" ? ("accordion" as const) : null,
        confidence: "high" as const,
        reason: "From the AI",
      })),
    );
    provider = mock;
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    const result = await suggestWithAIAction(id);
    if (!result.ok) throw new Error(result.error);

    const sent = mock.requests[0].frames.map((f) => f.nodeName);
    expect(sent).toContain("Frame 12");
    expect(sent).not.toContain("Header");
    expect(mock.requests[0].frames.find((f) => f.nodeName === "Frame 12")).toMatchObject({
      childNames: ["Question 1", "Question 2"],
      width: 1440,
    });
    expect(mock.requests[0].components.map((c) => c.id)).toEqual([
      "global",
      "header",
      "footer",
      "isi",
      "modals",
      "cta",
      "accordion",
    ]);
    expect(mapping(result.links, "4:13")).toMatchObject({
      componentId: "accordion",
      source: "ai",
      state: "suggested",
      reason: "From the AI",
    });
    expect(mapping(result.links, "4:10")).toMatchObject({ source: "pattern" });
  });

  it("reports provider errors and does nothing when nothing is ambiguous", async () => {
    provider = new MockLLMProvider({ fail: "rate_limited" });
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    expect(await suggestWithAIAction(id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/rate-limiting/),
    });

    const quiet = await project([
      link("btn", { scope: "component", pageName: undefined, nodeId: "3:10", componentId: "cta" }),
    ]);
    await detectFramesAction(quiet);
    expect(await suggestWithAIAction(quiet)).toMatchObject({
      ok: true,
      suggested: 0,
      notes: ["No ambiguous frames to ask about."],
    });
  });
});

describe("saveMappingsAction", () => {
  it("applies decisions and keeps a component link in sync", async () => {
    const id = await project([
      link("btn", { scope: "component", pageName: undefined, nodeId: "3:1", componentId: "cta" }),
    ]);
    await detectFramesAction(id);
    const result = await saveMappingsAction(id, [
      { linkId: "btn", nodeId: "3:1", componentId: "modals", state: "confirmed" },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.links[0].componentId).toBe("modals");
    expect(mapping(result.links, "3:1")).toMatchObject({
      componentId: "modals",
      source: "manual",
      reason: undefined,
    });
  });

  it.each([
    [
      { linkId: "home", nodeId: "4:13", componentId: null, state: "confirmed" as const },
      /Choose a component/,
    ],
    [
      {
        linkId: "home",
        nodeId: "4:13",
        componentId: "carousel" as never,
        state: "suggested" as const,
      },
      /Unknown component/,
    ],
    [{ linkId: "home", nodeId: "9:9", componentId: null, state: "ignored" as const }, /not found/],
    [{ linkId: "nope", nodeId: "4:13", componentId: null, state: "ignored" as const }, /not found/],
  ])("rejects %j", async (edit, error) => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    expect(await saveMappingsAction(id, [edit])).toMatchObject({
      ok: false,
      error: expect.stringMatching(error),
    });
  });
});
