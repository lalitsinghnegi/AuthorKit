import { randomBytes } from "node:crypto";
import { afterEach, beforeEach } from "vitest";

/** Give each test a fresh, valid ENCRYPTION_KEY and restore the previous value after. */
export function withEncryptionKey(): () => string {
  let key = "";
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.ENCRYPTION_KEY;
    key = randomBytes(32).toString("base64");
    process.env.ENCRYPTION_KEY = key;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  });
  return () => key;
}
