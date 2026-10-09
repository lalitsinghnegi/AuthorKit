import { describe, expect, it } from "vitest";
import { MAX_TREE_DEPTH, MAX_TREE_NODES, ScaffoldTree } from "./scaffold";

const id = "00000000-0000-4000-8000-000000000000";
const file = (name: string) => ({ id, type: "file", name, cssTemplateId: null });

describe("scaffold size limits", () => {
  it("refuses a deeply nested tree without overflowing the stack", () => {
    const text =
      `{"id":"${id}","type":"folder","name":"f","children":[`.repeat(5000) + "]}".repeat(5000);
    const result = ScaffoldTree.safeParse(JSON.parse(text));
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(`more than ${MAX_TREE_DEPTH} levels`);
  });

  it("refuses too many nodes", () => {
    const wide = {
      id,
      type: "folder",
      name: "r",
      children: Array.from({ length: MAX_TREE_NODES }, (_, i) => file(`f${i}.css`)),
    };
    expect(ScaffoldTree.safeParse(wide).error!.issues[0].message).toMatch(
      `more than ${MAX_TREE_NODES}`,
    );
  });

  it("accepts a normal tree", () => {
    expect(
      ScaffoldTree.safeParse({ id, type: "folder", name: "r", children: [file("a.css")] }).success,
    ).toBe(true);
  });
});
