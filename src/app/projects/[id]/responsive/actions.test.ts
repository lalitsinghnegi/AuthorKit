import { beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaError } from "@/lib/figma/errors";
import type { FigmaLink, FrameMapping } from "@/lib/model";
import { createProject, getResponsive, updateProject } from "@/lib/storage/projects";
import { FIXTURE_FILE_KEY, FIXTURE_URL, MockFigmaClient } from "@/test/figma/mockClient";
import { withTempDataDir } from "@/test/tempDataDir";

let connected = true;
let figma: MockFigmaClient;
vi.mock("@/lib/figma/server", () => ({
  getFigmaClient: async () => {
    if (!connected) throw new FigmaError("no_token");
    return figma;
  },
}));

const { extractResponsiveAction } = await import("./actions");

withTempDataDir();

beforeEach(() => {
  connected = true;
  figma = new MockFigmaClient();
});

const confirmed = (nodeId: string, componentId: FrameMapping["componentId"]): FrameMapping => ({
  nodeId,
  nodeName: nodeId,
  path: nodeId,
  componentId,
  state: "confirmed",
  source: "manual",
});

async function project(links: (bp: { m: string; d: string }) => FigmaLink[]) {
  const p = await createProject({
    name: "P",
    brandName: "Acme",
    prefix: "acme",
    approach: "mobile-first",
  });
  const [m, , d] = p.breakpoints.breakpoints;
  await updateProject(p.id, (x) => ({ ...x, figmaLinks: links({ m: m.id, d: d.id }) }));
  return { id: p.id, m: m.id, d: d.id };
}

const link = (
  id: string,
  nodeId: string,
  breakpointId: string | undefined,
  mappings: FrameMapping[],
): FigmaLink => ({
  id,
  label: id,
  scope: "global",
  url: FIXTURE_URL,
  fileKey: FIXTURE_FILE_KEY,
  nodeId,
  breakpointId,
  mappings,
});

describe("extractResponsiveAction", () => {
  it("reads confirmed frames per breakpoint, computes values and saves them", async () => {
    const { id, m, d } = await project(({ m, d }) => [
      link("desk", "2:1", d, [
        confirmed("2:1", "header"),
        confirmed("5:1", "footer"),
        confirmed("1:2", "global"),
      ]),
      link("mob", "2:2", m, [
        confirmed("2:2", "header"),
        confirmed("5:2", "footer"),
        confirmed("1:3", "global"),
      ]),
    ]);
    const result = await extractResponsiveAction(id);
    if (!result.ok) throw new Error(result.error);
    expect(figma.calls.map((c) => c.method)).toEqual(["getNodes"]);
    expect(result.data.components.header).toMatchObject({ mode: "breakpoints" });
    expect(result.data.components.footer!.values[d]["footer-direction"]).toEqual({
      value: "row",
      source: "frame",
    });
    expect(result.data.typography!.values[m]["font-size-h1"]).toEqual({
      value: "1.75rem",
      source: "frame",
    });
    expect(await getResponsive(id)).toEqual(result.data);
  });

  it("notes frames that are gone and explains missing prerequisites", async () => {
    const { id } = await project(({ d }) => [
      link("desk", "2:1", d, [confirmed("2:1", "header"), confirmed("99:99", "footer")]),
    ]);
    const result = await extractResponsiveAction(id);
    expect(result.ok && result.notes).toEqual([
      "Frame 99:99 was not found in Figma; detect frames again.",
    ]);

    const empty = await project(() => []);
    expect(await extractResponsiveAction(empty.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Confirm frames under Components/),
    });

    connected = false;
    expect(await extractResponsiveAction(id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No Figma token/),
    });
  });
});
