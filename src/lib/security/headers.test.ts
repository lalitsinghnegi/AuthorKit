import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { STYLE_GUIDE_CSP, appCsp, commonHeaders } from "./headers";

describe("security headers", () => {
  it("app policy allows only this origin for scripts and blocks framing", () => {
    const csp = appCsp(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'(;|$)/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(appCsp(true)).toContain("'unsafe-eval'");
  });

  it("style guide policy runs no inline script and may be framed by the app only", () => {
    expect(STYLE_GUIDE_CSP).toMatch(/script-src 'self'(;|$)/);
    expect(STYLE_GUIDE_CSP).toContain("frame-ancestors 'self'");
    expect(STYLE_GUIDE_CSP).toContain("connect-src 'none'");
  });

  it("sends HSTS only in production", () => {
    expect(commonHeaders(true).map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(commonHeaders(false).map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });

  it("applies the app policy everywhere except the style guide route", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))!;
    const re = new RegExp(`^${csp.source.replace("/(", "/(?:")}$`);
    expect(re.test("/projects/abc/tokens")).toBe(true);
    expect(re.test("/api/projects/abc/package")).toBe(true);
    expect(re.test("/api/projects/abc/styleguide/style-guide/index.html")).toBe(false);
  });
});
