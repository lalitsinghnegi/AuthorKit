/**
 * Server log lines as JSON on stderr (console.error works in every runtime), with anything that looks like a secret
 * replaced by [redacted]: the configured secret values themselves, Figma and
 * Anthropic tokens, bearer tokens, session cookies and password fields.
 */
const PATTERNS: RegExp[] = [
  /figd_[A-Za-z0-9_-]+/g,
  /sk-ant-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /ak_session=[^;\s]+/g,
  /("?(?:password|passwordHash|token|secret|apiKey|api_key)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi,
];

export function redact(
  text: string,
  env: Record<string, string | undefined> = process.env,
): string {
  let out = text;
  for (const name of ["ENCRYPTION_KEY", "SESSION_SECRET"]) {
    const value = env[name];
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  for (const re of PATTERNS) {
    out = out.replace(re, (_m, key?: string) =>
      typeof key === "string" ? `${key}[redacted]` : "[redacted]",
    );
  }
  return out;
}

type Fields = Record<string, string | number | boolean | undefined>;

export function logError(event: string, err: unknown, fields: Fields = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  write("error", event, { ...fields, error: e.name, message: e.message, stack: e.stack });
}

export function logWarn(event: string, fields: Fields = {}): void {
  write("warn", event, fields);
}

function write(level: string, event: string, fields: Fields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  console.error(redact(line));
}
