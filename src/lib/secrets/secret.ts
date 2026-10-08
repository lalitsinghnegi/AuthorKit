const value = new WeakMap<Secret, string>();

/**
 * Holds a sensitive string without exposing it by accident: printing,
 * string conversion, JSON serialisation and util.inspect all show
 * "[redacted]". Call reveal() only at the point of use (an HTTP header).
 */
export class Secret {
  constructor(plain: string) {
    value.set(this, plain);
  }
  reveal(): string {
    return value.get(this)!;
  }
  toString() {
    return "[redacted]";
  }
  toJSON() {
    return "[redacted]";
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return "Secret([redacted])";
  }
}
