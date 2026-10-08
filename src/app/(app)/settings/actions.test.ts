import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FigmaErrorCode } from "@/lib/figma/errors";
import { getFigmaToken } from "@/lib/storage/settings";
import { withEncryptionKey } from "@/test/encryptionKey";
import { MockFigmaClient } from "@/test/figma/mockClient";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";

// Every HttpFigmaClient the actions create is backed by fixtures instead of the network.
let failWith: FigmaErrorCode | undefined;
const seenTokens: string[] = [];
vi.mock("@/lib/figma/client", () => ({
  HttpFigmaClient: class extends MockFigmaClient {
    constructor(token: { reveal(): string }) {
      super({ failWith });
      seenTokens.push(token.reveal());
    }
  },
}));

const { saveFigmaTokenAction, testFigmaConnectionAction, removeFigmaTokenAction } =
  await import("./actions");

const dataDir = withTempDataDir();
withSignedIn("admin");
withEncryptionKey();

const TOKEN = "figd_actions-test-Qw7z";
const form = (token: string) => {
  const data = new FormData();
  data.set("token", token);
  return data;
};

beforeEach(() => {
  failWith = undefined;
  seenTokens.length = 0;
});

describe("settings actions", () => {
  it("checks the token with Figma, stores it encrypted and reports the account", async () => {
    const result = await saveFigmaTokenAction(null, form(`  ${TOKEN}  `));
    expect(result).toMatchObject({
      ok: true,
      message: "Connected as Acme Designer.",
      status: {
        connected: true,
        account: { handle: "Acme Designer", email: "designer@example.com" },
      },
    });
    expect(seenTokens).toEqual([TOKEN]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(await readFile(path.join(dataDir(), "settings.json"), "utf8")).not.toContain(TOKEN);
    expect((await getFigmaToken())?.reveal()).toBe(TOKEN);
    const log = await readFile(path.join(dataDir(), "audit.log"), "utf8");
    expect(log).toContain('"action":"settings.figma_token_saved"');
    expect(log).not.toContain(TOKEN);
  });

  it("does not store a token Figma rejects", async () => {
    failWith = "invalid_token";
    const result = await saveFigmaTokenAction(null, form(TOKEN));
    expect(result).toEqual({
      ok: false,
      error: "Figma rejected the token. It may be expired or revoked; save a new one in Settings.",
    });
    expect(await getFigmaToken()).toBeNull();
  });

  it.each([
    ["", "Paste a Figma personal access token."],
    ["has spaces in it", "That does not look like a Figma token."],
    ["x".repeat(301), "That does not look like a Figma token."],
  ])("rejects %j before calling Figma", async (token, error) => {
    expect(await saveFigmaTokenAction(null, form(token))).toEqual({ ok: false, error });
    expect(seenTokens).toEqual([]);
  });

  it("explains the missing encryption key", async () => {
    delete process.env.ENCRYPTION_KEY;
    const result = await saveFigmaTokenAction(null, form(TOKEN));
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/ENCRYPTION_KEY/) });
    expect(seenTokens).toEqual([]);
  });

  it("tests the saved connection and reports a missing token", async () => {
    expect(await testFigmaConnectionAction()).toMatchObject({
      ok: false,
      error: "No Figma token is saved. Add one in Settings.",
    });
    await saveFigmaTokenAction(null, form(TOKEN));
    expect(await testFigmaConnectionAction()).toMatchObject({
      ok: true,
      message: "Connection works. Signed in to Figma as Acme Designer.",
    });
    failWith = "network";
    expect(await testFigmaConnectionAction()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Cannot reach Figma/),
    });
  });

  it("removes the token", async () => {
    await saveFigmaTokenAction(null, form(TOKEN));
    expect(await removeFigmaTokenAction()).toMatchObject({
      ok: true,
      status: { connected: false },
    });
    expect(await getFigmaToken()).toBeNull();
  });
});
