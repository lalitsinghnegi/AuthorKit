import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, redact } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("log redaction", () => {
  it("hides tokens, cookies, passwords and configured secrets", () => {
    const env = { SESSION_SECRET: "super-secret-session-value-123", ENCRYPTION_KEY: undefined };
    const text = [
      "token figd_AbC123-xyz in header",
      "key sk-ant-api03-ABCdef_123",
      "Authorization: Bearer abc.def.ghi",
      "cookie: ak_session=eyJ1.c2ln; other=1",
      '{"password":"hunter2 hunter2","name":"ok"}',
      "secret=plainvalue",
      "leaked super-secret-session-value-123 here",
    ].join("\n");
    const out = redact(text, env);
    for (const secret of [
      "figd_AbC123",
      "sk-ant-api03",
      "abc.def.ghi",
      "eyJ1.c2ln",
      "hunter2",
      "plainvalue",
      "super-secret-session",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('"name":"ok"');
    expect(out).toContain("other=1");
  });

  it("writes one redacted JSON line per error", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("figma_failed", new Error("bad token figd_SECRET123"), { path: "/projects/x" });
    const line = String(write.mock.calls[0][0]);
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "error",
      event: "figma_failed",
      path: "/projects/x",
      error: "Error",
    });
    expect(line).not.toContain("figd_SECRET123");
  });
});
