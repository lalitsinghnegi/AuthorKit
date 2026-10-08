import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";
import type { User } from "@/lib/model";
import { updateUser } from "@/lib/storage/users";
import { addTestUser } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { proxy } from "./proxy";

withTempDataDir();
let user: User;
let admin: User;
beforeEach(async () => {
  admin = await addTestUser("admin");
  user = await addTestUser("viewer");
});

const request = (pathname: string, cookie?: string) =>
  new NextRequest(new URL(pathname, "http://localhost:3000"), {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
const valid = (version = 1) =>
  signSession(
    { userId: user.id, version, expiresAt: Date.now() + 60_000 },
    process.env.SESSION_SECRET!,
  );

describe("proxy", () => {
  it("sends signed-out visitors to sign in, keeping where they were going", async () => {
    const res = await proxy(request("/projects/abc/tokens?x=1"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/projects/abc/tokens?x=1");
  });

  it("answers API calls with 401 instead of a redirect", async () => {
    const res = await proxy(request("/api/projects/abc/package"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to continue." });
  });

  it("lets public paths and valid sessions through", async () => {
    for (const p of ["/login", "/setup", "/api/health"])
      expect((await proxy(request(p))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/projects", valid()))).headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects forged or expired cookies", async () => {
    const expired = signSession(
      { userId: user.id, version: 1, expiresAt: Date.now() - 1 },
      process.env.SESSION_SECRET!,
    );
    expect((await proxy(request("/projects", expired))).status).toBe(307);
    expect((await proxy(request("/projects", `${valid().split(".")[0]}.AAAA`))).status).toBe(307);
    expect((await proxy(request("/loginx"))).status).toBe(307);
  });
});

describe("proxy session revocation", () => {
  it("ends sessions of disabled users, changed roles and unknown users at once", async () => {
    expect((await proxy(request("/projects", valid()))).headers.get("x-middleware-next")).toBe("1");
    await updateUser(admin.id, user.id, { disabled: true });
    expect((await proxy(request("/projects", valid()))).status).toBe(307);
    expect((await proxy(request("/api/projects/x/package", valid()))).status).toBe(401);
    // A re-signed cookie with the old version is still refused after re-enabling.
    await updateUser(admin.id, user.id, { disabled: false });
    expect((await proxy(request("/projects", valid(1)))).status).toBe(307);
    expect((await proxy(request("/projects", valid(3)))).headers.get("x-middleware-next")).toBe(
      "1",
    );
    const ghost = signSession(
      { userId: "nobody", version: 1, expiresAt: Date.now() + 60_000 },
      process.env.SESSION_SECRET!,
    );
    expect((await proxy(request("/projects", ghost))).status).toBe(307);
  });
});
