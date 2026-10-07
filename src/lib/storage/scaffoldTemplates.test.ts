import { describe, expect, it } from "vitest";
import { defaultScaffold } from "@/lib/model/defaults";
import type { ScaffoldTemplate } from "@/lib/model";
import { withTempDataDir } from "@/test/tempDataDir";
import {
  availableTemplateId,
  deleteScaffoldTemplate,
  getScaffoldTemplate,
  listScaffoldTemplates,
  saveScaffoldTemplate,
} from "./scaffoldTemplates";

withTempDataDir();

const template = (id: string, name: string): ScaffoldTemplate => ({
  schemaVersion: 1,
  id,
  name,
  builtIn: false,
  tree: defaultScaffold("root"),
});

describe("scaffold templates repository", () => {
  it("lists built-ins first, then custom templates by name", async () => {
    await saveScaffoldTemplate(template("zeta", "Zeta"));
    await saveScaffoldTemplate(template("alpha", "Alpha"));
    expect((await listScaffoldTemplates()).map((t) => t.id)).toEqual([
      "basic",
      "component-based",
      "alpha",
      "zeta",
    ]);
    expect((await getScaffoldTemplate("alpha"))?.name).toBe("Alpha");
    expect((await getScaffoldTemplate("basic"))?.builtIn).toBe(true);
  });

  it("never marks saved templates as built-in", async () => {
    await saveScaffoldTemplate({ ...template("sneaky", "Sneaky"), builtIn: true });
    expect((await getScaffoldTemplate("sneaky"))?.builtIn).toBe(false);
  });

  it("protects built-in ids from being saved or deleted", async () => {
    await expect(saveScaffoldTemplate(template("basic", "Mine"))).rejects.toThrow(/Built-in/);
    await expect(deleteScaffoldTemplate("component-based")).rejects.toThrow(/Built-in/);
  });

  it("rejects unsafe ids", async () => {
    await expect(saveScaffoldTemplate(template("../x", "X"))).rejects.toThrow();
    expect(await getScaffoldTemplate("../x")).toBeNull();
  });

  it("deletes custom templates", async () => {
    await saveScaffoldTemplate(template("mine", "Mine"));
    await deleteScaffoldTemplate("mine");
    expect(await getScaffoldTemplate("mine")).toBeNull();
  });

  it("derives free ids from names", async () => {
    expect(await availableTemplateId("My Preset!")).toBe("my-preset");
    await saveScaffoldTemplate(template("my-preset", "My Preset"));
    expect(await availableTemplateId("My Preset")).toBe("my-preset-2");
    expect(await availableTemplateId("Basic")).toBe("basic-2");
    expect(await availableTemplateId("!!!")).toBe("preset");
  });
});
