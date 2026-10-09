import { afterEach, describe, expect, it } from "vitest";
import { project } from "@/test/figmaProject";
import type { BuiltPackage } from "./build";
import { BusyError, MAX_RUNNING, QUEUE_MS, buildPackageLimited, resetBuildLimits } from "./limit";

afterEach(() => resetBuildLimits());

/** A fake build that finishes when its gate is opened. */
function gated() {
  const calls: string[] = [];
  const gates: (() => void)[] = [];
  const build = (p: { name: string }) =>
    new Promise<BuiltPackage>((resolve) => {
      calls.push(p.name);
      gates.push(() => resolve({ files: [] } as unknown as BuiltPackage));
    });
  return { calls, gates, build: build as never };
}
const variant = (name: string) => ({ ...project("mobile-first"), name });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("package build limits", () => {
  it("shares one build between identical requests", async () => {
    const g = gated();
    const a = buildPackageLimited(variant("A"), {}, "u1", g.build);
    const b = buildPackageLimited(variant("A"), {}, "u2", g.build);
    await tick();
    expect(g.calls).toEqual(["A"]);
    g.gates[0]();
    expect(await a).toBe(await b);
    // Still cached afterwards; a changed project builds again.
    await buildPackageLimited(variant("A"), {}, "u1", g.build);
    void buildPackageLimited(variant("B"), {}, "u1", g.build);
    await tick();
    expect(g.calls).toEqual(["A", "B"]);
  });

  it("runs at most MAX_RUNNING builds at once and queues the rest", async () => {
    const g = gated();
    const runs = ["A", "B", "C"].map((n, i) =>
      buildPackageLimited(variant(n), {}, `u${i}`, g.build),
    );
    await tick();
    expect(g.calls).toHaveLength(MAX_RUNNING);
    g.gates[0]();
    await runs[0];
    await tick();
    expect(g.calls).toEqual(["A", "B", "C"]);
    g.gates[1]();
    g.gates[2]();
    await Promise.all(runs);
  });

  it("refuses a third different build from one user", async () => {
    const g = gated();
    void buildPackageLimited(variant("A"), {}, "u1", g.build);
    void buildPackageLimited(variant("B"), {}, "u1", g.build);
    await expect(buildPackageLimited(variant("C"), {}, "u1", g.build)).rejects.toBeInstanceOf(
      BusyError,
    );
    // Another user is not affected (queued behind the two running builds).
    void buildPackageLimited(variant("D"), {}, "u2", g.build);
    g.gates.forEach((open) => open());
  });

  it("gives up after waiting QUEUE_MS", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    try {
      const g = gated();
      void buildPackageLimited(variant("A"), {}, "u1", g.build);
      void buildPackageLimited(variant("B"), {}, "u2", g.build);
      const waiting = buildPackageLimited(variant("C"), {}, "u3", g.build);
      const settled = expect(waiting).rejects.toBeInstanceOf(BusyError);
      await vi.advanceTimersByTimeAsync(QUEUE_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache failures", async () => {
    let n = 0;
    const flaky = (async () => {
      if (n++ === 0) throw new Error("boom");
      return { files: [] };
    }) as never;
    await expect(buildPackageLimited(variant("A"), {}, "u1", flaky)).rejects.toThrow("boom");
    await expect(buildPackageLimited(variant("A"), {}, "u1", flaky)).resolves.toEqual({
      files: [],
    });
  });
});
