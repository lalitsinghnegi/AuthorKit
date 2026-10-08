import { beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaError, type FigmaErrorCode } from "@/lib/figma/errors";
import { createProject, getProject } from "@/lib/storage/projects";
import { FIXTURE_FILE_KEY, FIXTURE_URL, MockFigmaClient } from "@/test/figma/mockClient";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

let connected = true;
let failWith: FigmaErrorCode | undefined;
vi.mock("@/lib/figma/server", () => ({
  getFigmaClient: async () => {
    if (!connected) throw new FigmaError("no_token");
    return new MockFigmaClient({ failWith });
  },
}));

const { checkFigmaLinkAction, deleteFigmaLinkAction, saveFigmaLinkAction } =
  await import("./actions");
const { saveBreakpointsAction } = await import("../breakpoints/actions");

withTempDataDir();
withSignedIn("admin");

beforeEach(() => {
  connected = true;
  failWith = undefined;
});

const newProject = () =>
  createProject({ name: "Launch", brandName: "Acme", prefix: "acme", approach: "mobile-first" });

describe("Figma link actions", () => {
  it("adds a link, deriving file key and node id on the server", async () => {
    const project = await newProject();
    const desktop = project.breakpoints.breakpoints[2];
    const result = await saveFigmaLinkAction(project.id, {
      label: "Header, desktop",
      scope: "component",
      componentId: "header",
      url: `${FIXTURE_URL}?node-id=2-1`,
      breakpointId: desktop.id,
      pageName: "ignored for components",
    });
    expect(result.ok).toBe(true);
    const [link] = (await getProject(project.id))!.figmaLinks;
    expect(link).toMatchObject({
      label: "Header, desktop",
      scope: "component",
      componentId: "header",
      fileKey: FIXTURE_FILE_KEY,
      nodeId: "2:1",
      breakpointId: desktop.id,
    });
    expect(link.pageName).toBeUndefined();
  });

  it("edits and deletes links", async () => {
    const project = await newProject();
    await saveFigmaLinkAction(project.id, {
      label: "Home",
      scope: "page",
      pageName: "Home",
      url: FIXTURE_URL,
    });
    const [link] = (await getProject(project.id))!.figmaLinks;

    await saveFigmaLinkAction(project.id, {
      id: link.id,
      label: "Home v2",
      scope: "page",
      pageName: "Home",
      url: FIXTURE_URL,
    });
    expect((await getProject(project.id))!.figmaLinks.map((l) => l.label)).toEqual(["Home v2"]);

    expect(await deleteFigmaLinkAction(project.id, link.id)).toEqual({ ok: true, links: [] });
  });

  it.each([
    [
      { label: "x", scope: "global", url: "https://evil.com/design/AbCdEf1234567890" },
      "Only figma.com links are allowed (got evil.com)",
    ],
    [{ label: " ", scope: "global", url: FIXTURE_URL }, "Label is required"],
    [{ label: "x", scope: "page", url: FIXTURE_URL }, "Page links need a page name"],
    [
      { label: "x", scope: "global", url: FIXTURE_URL, breakpointId: "nope" },
      "That breakpoint no longer exists. Reload the page.",
    ],
    [
      { id: "missing", label: "x", scope: "global", url: FIXTURE_URL },
      "That link no longer exists. Reload the page.",
    ],
  ] as const)("rejects %j", async (input, error) => {
    const project = await newProject();
    expect(await saveFigmaLinkAction(project.id, input)).toEqual({ ok: false, error });
    expect((await getProject(project.id))!.figmaLinks).toEqual([]);
  });

  it("checks a link against Figma", async () => {
    expect(await checkFigmaLinkAction(`${FIXTURE_URL}?node-id=2-1`)).toEqual({
      ok: true,
      fileName: "Acme Health: Design System",
      nodeName: "Header / Desktop",
      nodeType: "FRAME",
    });
    expect(await checkFigmaLinkAction(FIXTURE_URL)).toEqual({
      ok: true,
      fileName: "Acme Health: Design System",
    });
    expect(await checkFigmaLinkAction(`${FIXTURE_URL}?node-id=99-99`)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/could not find/),
    });
    expect(
      await checkFigmaLinkAction("https://www.figma.com/design/OtherFile1234567890/x"),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/could not find/),
    });
    failWith = "no_access";
    expect(await checkFigmaLinkAction(FIXTURE_URL)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/cannot open that file/),
    });
    connected = false;
    expect(await checkFigmaLinkAction(FIXTURE_URL)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No Figma token/),
    });
  });

  it("blocks removing a breakpoint that a link uses", async () => {
    const project = await newProject();
    const [mobile, tablet, desktop] = project.breakpoints.breakpoints;
    await saveFigmaLinkAction(project.id, {
      label: "Tablet home",
      scope: "page",
      pageName: "Home",
      url: FIXTURE_URL,
      breakpointId: tablet.id,
    });

    const result = await saveBreakpointsAction(project.id, {
      approach: "mobile-first",
      breakpoints: { breakpoints: [{ ...mobile, maxWidth: 1023 }, desktop] },
    });
    expect(result).toEqual({
      ok: false,
      error: 'Breakpoint "tablet" is used by the Figma link "Tablet home". Change that link first.',
    });
  });
});
