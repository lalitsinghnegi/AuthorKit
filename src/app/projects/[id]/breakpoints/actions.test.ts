import { describe, expect, it } from "vitest";
import { createProject, getProject } from "@/lib/storage/projects";
import { withTempDataDir } from "@/test/tempDataDir";
import { saveBreakpointsAction } from "./actions";

withTempDataDir();

const newProject = () =>
  createProject({ name: "P", brandName: "B", prefix: "pp", approach: "mobile-first" });

const four = [
  { id: "m", name: "mobile", maxWidth: 767 },
  { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
  { id: "d", name: "desktop", minWidth: 1024, maxWidth: 1439 },
  { id: "l", name: "large", minWidth: 1440 },
];

describe("saveBreakpointsAction", () => {
  it("saves valid breakpoints and the approach", async () => {
    const { id } = await newProject();
    const result = await saveBreakpointsAction(id, {
      approach: "desktop-first",
      breakpoints: { breakpoints: four },
    });
    expect(result.ok).toBe(true);
    const saved = await getProject(id);
    expect(saved?.approach).toBe("desktop-first");
    expect(saved?.breakpoints.breakpoints).toEqual(four);
  });

  it("refuses overlaps even if the client let them through", async () => {
    const { id, breakpoints } = await newProject();
    const overlapping = four.map((b) => (b.id === "t" ? { ...b, maxWidth: 1024 } : b));
    const result = await saveBreakpointsAction(id, {
      approach: "mobile-first",
      breakpoints: { breakpoints: overlapping },
    });
    expect(result).toEqual({ ok: false, error: "tablet and desktop both match 1024px" });
    expect((await getProject(id))?.breakpoints).toEqual(breakpoints);
  });

  it("allows warnings (uncovered ends)", async () => {
    const { id } = await newProject();
    const result = await saveBreakpointsAction(id, {
      approach: "mobile-first",
      breakpoints: { breakpoints: [{ id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 }] },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects malformed payloads and unknown projects", async () => {
    const { id } = await newProject();
    expect((await saveBreakpointsAction(id, { approach: "sideways" })).ok).toBe(false);
    expect(
      await saveBreakpointsAction("00000000-0000-4000-8000-000000000000", {
        approach: "mobile-first",
        breakpoints: { breakpoints: four },
      }),
    ).toEqual({ ok: false, error: "This project no longer exists." });
  });
});
