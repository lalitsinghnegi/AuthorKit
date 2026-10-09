import type { Instrumentation } from "next";

/** Runs once when the server starts: print the setup code if there are no users yet. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSetupCode } = await import("@/lib/auth/setup");
  await ensureSetupCode().catch(() => {
    // Data folder not ready: /setup will try again on first visit.
  });
}

/**
 * Log server errors once, redacted, with the digest shown to the user so an
 * admin can match a report to the log. Query strings are dropped.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logError } = await import("@/lib/log");
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  logError("request_error", err, {
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
  });
};
