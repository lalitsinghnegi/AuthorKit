import { beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaError, type FigmaErrorCode } from "@/lib/figma/errors";
import type { FigmaClient } from "@/lib/figma/client";
import { createProject, getTokens, updateProject } from "@/lib/storage/projects";
import { FIXTURE_FILE_KEY, FIXTURE_URL, MockFigmaClient } from "@/test/figma/mockClient";
import { withTempDataDir } from "@/test/tempDataDir";

let connected = true;
let failWith: FigmaErrorCode | undefined;
let failOn: (keyof FigmaClient)[] | undefined;
let lastClient: MockFigmaClient | undefined;
vi.mock("@/lib/figma/server", () => ({
  getFigmaClient: async () => {
    if (!connected) throw new FigmaError("no_token");
    lastClient = new MockFigmaClient({ failWith, failOn });
    return lastClient;
  },
}));

const { extractTokensAction, saveTokensAction } = await import("./actions");

withTempDataDir();

beforeEach(() => {
  connected = true;
  failWith = undefined;
  failOn = undefined;
});

async function projectWithLinks(
  links: { nodeId?: string; scope?: "global" | "component" | "page" }[],
) {
  const project = await createProject({
    name: "P",
    brandName: "Acme",
    prefix: "acme",
    approach: "mobile-first",
  });
  await updateProject(project.id, (p) => ({
    ...p,
    figmaLinks: links.map((l, i) => ({
      id: `l${i}`,
      label: `Link ${i}`,
      scope: l.scope ?? "global",
      pageName: l.scope === "page" ? "Home" : undefined,
      url: FIXTURE_URL,
      fileKey: FIXTURE_FILE_KEY,
      nodeId: l.nodeId,
    })),
  }));
  return project.id;
}

describe("extractTokensAction", () => {
  it("reads only the linked frames, saves tokens and reports a summary", async () => {
    const id = await projectWithLinks([
      { nodeId: "1:1" },
      { nodeId: "1:2" },
      { nodeId: "3:1", scope: "component" },
    ]);
    const result = await extractTokensAction(id);
    expect(result).toMatchObject({ ok: true, notes: [], summary: { changed: 0, missing: 0 } });
    if (!result.ok) return;
    expect(lastClient!.calls.map((c) => c.method)).toEqual(["getNodes", "getLocalVariables"]);
    expect(lastClient!.calls[0].args).toEqual([FIXTURE_FILE_KEY, ["1:1", "1:2", "3:1"]]);
    const names = result.tokens.map((t) => t.name);
    expect(names).toContain("color-primary");
    expect(names).toContain("font-size-h1");
    expect(names).not.toContain("color-header-background"); // header frame not linked
    expect(await getTokens(id)).toEqual(result.tokens);
  });

  it("reads the whole file when a link has no frame, and ignores page links", async () => {
    const id = await projectWithLinks([{}, { nodeId: "2:2", scope: "page" }]);
    const result = await extractTokensAction(id);
    expect(lastClient!.calls[0].method).toBe("getFile");
    expect(result.ok && result.tokens.some((t) => t.name === "color-header-background")).toBe(true);
  });

  it("falls back to styles when variables are not on the plan", async () => {
    failWith = "plan_limit";
    failOn = ["getLocalVariables"];
    const id = await projectWithLinks([{ nodeId: "1:1" }]);
    const result = await extractTokensAction(id);
    expect(result).toMatchObject({
      ok: true,
      notes: [
        "Figma variables are not available for this account, so styles and layers were used.",
      ],
    });
  });

  it("re-extraction keeps decisions and reports changes", async () => {
    const id = await projectWithLinks([{ nodeId: "1:1" }]);
    const first = await extractTokensAction(id);
    if (!first.ok) throw new Error(first.error);
    const primary = first.tokens.find((t) => t.name === "color-primary")!;
    await saveTokensAction(
      id,
      first.tokens.map((t) => ({ ...t, status: t.id === primary.id ? "accepted" : t.status })),
    );

    const second = await extractTokensAction(id);
    expect(second).toMatchObject({ ok: true, summary: { added: 0, changed: 0 } });
    expect(second.ok && second.tokens.find((t) => t.id === primary.id)?.status).toBe("accepted");
  });

  it("notes frames that no longer exist", async () => {
    const id = await projectWithLinks([{ nodeId: "1:1" }, { nodeId: "99:99" }]);
    const result = await extractTokensAction(id);
    expect(result.ok && result.notes).toEqual([
      'The frame for "Link 1" was not found in Figma; check the link.',
    ]);
  });

  it.each([
    ["no links", [], undefined, true, /Add a Figma link for global styles or a component first/],
    ["only page links", [{ scope: "page" as const }], undefined, true, /Add a Figma link/],
    ["no token", [{}], undefined, false, /No Figma token is saved/],
    ["no access", [{}], "no_access" as const, true, /cannot open that file/],
  ])("explains %s", async (_label, links, fail, isConnected, error) => {
    connected = isConnected;
    failWith = fail;
    const id = await projectWithLinks(links);
    expect(await extractTokensAction(id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(error),
    });
  });
});

describe("saveTokensAction", () => {
  async function extracted() {
    const id = await projectWithLinks([{ nodeId: "1:1" }, { nodeId: "1:2" }]);
    const result = await extractTokensAction(id);
    if (!result.ok) throw new Error(result.error);
    return { id, tokens: result.tokens };
  }

  it("saves renames, overrides and exclusions, deriving the status from the value", async () => {
    const { id, tokens } = await extracted();
    const primaryId = tokens.find((t) => t.name === "color-primary")!.id;
    const edits = tokens.map((t) =>
      t.name === "color-primary"
        ? { ...t, value: "#000000", status: "accepted" as const }
        : t.name === "color-one-off-accent"
          ? { ...t, status: "excluded" as const }
          : t.name === "color-link"
            ? { ...t, name: "color-link-hover", status: "accepted" as const }
            : t,
    );
    const result = await saveTokensAction(id, edits);
    expect(result.ok).toBe(true);
    const saved = await getTokens(id);
    expect(saved.find((t) => t.id === primaryId)).toMatchObject({
      status: "overridden",
      value: "#000000",
      originalValue: "#8a0b4f",
    });
    expect(saved.find((t) => t.meta?.figmaName === "One-off accent")?.status).toBe("excluded");
    expect(saved.find((t) => t.name === "color-link-hover")?.meta).toMatchObject({ mapped: true });
  });

  it("deletes tokens left out of the edits", async () => {
    const { id, tokens } = await extracted();
    await saveTokensAction(id, tokens.slice(1));
    expect((await getTokens(id)).length).toBe(tokens.length - 1);
  });

  it.each([
    [() => ({ name: "Bad Name" }), /not a valid token name/],
    [() => ({ value: "red; } body { x" }), /cannot contain/],
    [() => ({ value: "16" }), /Use a color/],
  ])("rejects invalid edits", async (patch, error) => {
    const { id, tokens } = await extracted();
    const primary = tokens.find((t) => t.name === "color-primary")!;
    const result = await saveTokensAction(
      id,
      tokens.map((t) => (t.id === primary.id ? { ...t, ...patch() } : t)),
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(error) });
    expect(await getTokens(id)).toEqual(tokens);
  });

  it("rejects duplicate active names", async () => {
    const { id, tokens } = await extracted();
    const result = await saveTokensAction(
      id,
      tokens.map((t) => (t.name === "color-text" ? { ...t, name: "color-primary" } : t)),
    );
    expect(result).toEqual({ ok: false, error: 'Duplicate token name "color-primary"' });
  });
});
