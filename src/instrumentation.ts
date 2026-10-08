/** Runs once when the server starts: print the setup code if there are no users yet. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSetupCode } = await import("@/lib/auth/setup");
  await ensureSetupCode().catch(() => {
    // Data folder not ready: /setup will try again on first visit.
  });
}
