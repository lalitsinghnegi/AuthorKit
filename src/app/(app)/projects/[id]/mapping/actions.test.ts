import { beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaError } from "@/lib/figma/errors";
import type { FigmaLink } from "@/lib/model";
import { createProject, getProject, updateProject } from "@/lib/storage/projects";
import { saveComponentPatterns } from "@/lib/storage/settings";
import { FIXTURE_FILE_KEY, FIXTURE_URL, MockFigmaClient } from "@/test/figma/mockClient";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

let connected = true;
let figma: MockFigmaClient;
vi.mock("@/lib/figma/server", () => ({
  getFigmaClient: async () => {
    if (!connected) throw new FigmaError("no_token");
    return figma;
  },
}));
const { detectFramesAction, loadPreviewsAction, saveMappingsAction } = await import("./actions");

withTempDataDir();
withSignedIn("admin");

beforeEach(() => {
  connected = true;
  figma = new MockFigmaClient();
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
  it("confirms clearly named frames, drops the rest and notes whole-file links", async () => {
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
      source: "pattern",
      reason: "Name is “header”",
    });
    // "Frame 12" matches no pattern, so it is not listed at all.
    expect(mapping(result.links, "4:13")).toBeUndefined();
    // A component link's own frame is confirmed from the link.
    expect(mapping(result.links, "3:1")).toMatchObject({
      componentId: "cta",
      source: "manual",
      reason: "Set on the Figma link",
    });
    const stored = result.links.flatMap((l) => l.mappings ?? []);
    expect(stored.every((m) => !("state" in m) && !("confidence" in m))).toBe(true);
    expect((await getProject(id))!.figmaLinks).toEqual(result.links);
  });

  it("uses saved name patterns", async () => {
    await saveComponentPatterns({ accordion: ["frame 12"] });
    const id = await project([link("home", { nodeId: "4:1" })]);
    const result = await detectFramesAction(id);
    expect(result.ok && mapping(result.links, "4:13")).toMatchObject({
      componentId: "accordion",
      source: "pattern",
    });
  });

  it("keeps changed components on re-detection; removed frames come back if their name matches", async () => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    const saved1 = await saveMappingsAction(id, [
      { linkId: "home", nodeId: "4:10", componentId: "footer" },
      { linkId: "home", nodeId: "4:15", componentId: null },
    ]);
    expect(saved1.ok).toBe(true);
    const saved = await getProject(id);
    expect(mapping(saved!.figmaLinks, "4:15")).toBeUndefined();

    const again = await detectFramesAction(id);
    if (!again.ok) throw new Error(again.error);
    expect(mapping(again.links, "4:10")).toMatchObject({ componentId: "footer", source: "manual" });
    expect(mapping(again.links, "4:15")).toMatchObject({ source: "pattern" });
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
  it("renders previews for mapped frames only", async () => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    expect(
      (await saveMappingsAction(id, [{ linkId: "home", nodeId: "4:15", componentId: null }])).ok,
    ).toBe(true);
    figma.calls.length = 0;
    const result = await loadPreviewsAction(id);
    if (!result.ok) throw new Error(result.error);
    const [call] = figma.calls;
    expect(call.method).toBe("getImages");
    expect(call.args[1]).not.toContain("4:15");
    expect(call.args[2]).toEqual({ format: "png", scale: 0.5 });
    expect(result.images["4:10"]).toBe(
      "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4-10.png",
    );
    expect(result.images["4:100"]).toBeUndefined();
  });
});

describe("saveMappingsAction", () => {
  it("changes a component and keeps a component link in sync", async () => {
    const id = await project([
      link("btn", { scope: "component", pageName: undefined, nodeId: "3:1", componentId: "cta" }),
    ]);
    await detectFramesAction(id);
    const result = await saveMappingsAction(id, [
      { linkId: "btn", nodeId: "3:1", componentId: "modals" },
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
    [{ linkId: "home", nodeId: "4:10", componentId: "carousel" as never }, /Unknown component/],
    // Only listed (confirmed) frames can change; "Frame 12" (4:13) was never confirmed.
    [{ linkId: "home", nodeId: "4:13", componentId: "accordion" as const }, /not found/],
    [{ linkId: "home", nodeId: "9:9", componentId: null }, /not found/],
    [{ linkId: "nope", nodeId: "4:10", componentId: null }, /not found/],
  ])("rejects %j", async (edit, error) => {
    const id = await project([link("home", { nodeId: "4:1" })]);
    await detectFramesAction(id);
    expect(await saveMappingsAction(id, [edit])).toMatchObject({
      ok: false,
      error: expect.stringMatching(error),
    });
  });
});
