import { describe, expect, it } from "vitest";
import { defaultScaffold } from "@/lib/model/defaults";
import type { ScaffoldTemplate } from "@/lib/model";
import { withTempDataDir } from "@/test/tempDataDir";
import {
  deleteScaffoldTemplate,
  getScaffoldTemplate,
  listScaffoldTemplates,
  saveScaffoldTemplate,
} from "./scaffoldTemplates";

withTempDataDir();

const template = (id: string, name: string, builtIn = false): ScaffoldTemplate => ({
  schemaVersion: 1,
  id,
  name,
  builtIn,
  tree: defaultScaffold("root"),
});

describe("scaffold templates repository", () => {
  it("saves, lists by name, and reads templates", async () => {
    await saveScaffoldTemplate(template("component-based", "Component-based"));
    await saveScaffoldTemplate(template("basic", "Basic"));
    expect((await listScaffoldTemplates()).map((t) => t.id)).toEqual(["basic", "component-based"]);
    expect((await getScaffoldTemplate("basic"))?.name).toBe("Basic");
  });

  it("rejects unsafe ids", async () => {
    await expect(saveScaffoldTemplate(template("../x", "X"))).rejects.toThrow();
    expect(await getScaffoldTemplate("../x")).toBeNull();
  });

  it("deletes custom templates but not built-in ones", async () => {
    await saveScaffoldTemplate(template("mine", "Mine"));
    await saveScaffoldTemplate(template("basic", "Basic", true));
    await deleteScaffoldTemplate("mine");
    await expect(deleteScaffoldTemplate("basic")).rejects.toThrow(/Built-in/);
    expect((await listScaffoldTemplates()).map((t) => t.id)).toEqual(["basic"]);
  });
});
