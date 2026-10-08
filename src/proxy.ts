import { NextResponse, type NextRequest } from "next/server";
import { isSessionActive } from "@/lib/auth/activeSession";
import { SESSION_COOKIE, getSessionSecret, verifySession } from "@/lib/auth/token";

const PUBLIC = ["/login", "/setup", "/api/health"];

/**
 * Sends visitors without a live session to sign in: the cookie must be signed,
 * unexpired, and belong to an enabled user whose session version matches.
 * Roles are enforced by every page and server action.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return NextResponse.next();

  let valid = false;
  try {
    const payload = verifySession(request.cookies.get(SESSION_COOKIE)?.value, getSessionSecret());
    valid = payload !== null && (await isSessionActive(payload));
  } catch {
    valid = false; // No SESSION_SECRET: nobody can be signed in; /login explains why.
  }
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
