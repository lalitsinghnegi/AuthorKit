import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Secret } from "@/lib/secrets/secret";
import { withEncryptionKey } from "@/test/encryptionKey";
import { withTempDataDir } from "@/test/tempDataDir";
import { getFigmaStatus, getFigmaToken, removeFigmaToken, saveFigmaToken } from "./settings";

const dataDir = withTempDataDir();
withEncryptionKey();

const TOKEN = "figd_settings-test-Zq9x";
const account = { id: "1", handle: "Acme Designer", email: "d@example.com" };

describe("settings repository", () => {
  it("stores the token encrypted and reports status without it", async () => {
    expect(await getFigmaStatus()).toEqual({ connected: false });
    await saveFigmaToken(new Secret(TOKEN), account);

    const raw = await readFile(path.join(dataDir(), "settings.json"), "utf8");
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toContain(TOKEN.slice(-4));

    const status = await getFigmaStatus();
    expect(status).toMatchObject({ connected: true, account });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect((await getFigmaToken())?.reveal()).toBe(TOKEN);
  });

  it("removes the token and account", async () => {
    await saveFigmaToken(new Secret(TOKEN), account);
    await removeFigmaToken();
    expect(await getFigmaStatus()).toEqual({ connected: false });
    expect(await getFigmaToken()).toBeNull();
  });

  it("cannot read the token with a different key", async () => {
    await saveFigmaToken(new Secret(TOKEN), account);
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await expect(getFigmaToken()).rejects.toThrow();
  });
});
