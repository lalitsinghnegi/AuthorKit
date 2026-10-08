/** Only same-site relative paths are allowed as the post-login destination. */
export function safeNext(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/projects";
}
