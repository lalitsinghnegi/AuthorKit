import type { TokenType } from "@/lib/model";

const LENGTH = /^-?(\d+\.?\d*|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch)$/;
const COLOR =
  /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9a-z.%\s,/+-]+\)|transparent|currentcolor|[a-z]+)$/i;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

const lengthOrZero = (v: string) => v === "0" || LENGTH.test(v);

/**
 * Check a token value an admin typed. Values are written into generated CSS,
 * so anything that could end a declaration or open a comment is refused.
 * Returns an error message, or null when the value is fine.
 */
export function validateTokenValue(type: TokenType, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter a value";
  if (value.length > 300) return "Value is too long";
  if (/[;{}<>\\]|\/\*|\*\//.test(value)) return "Value cannot contain ; { } < > \\ or comments";

  switch (type) {
    case "color":
      return COLOR.test(value) ? null : "Use a color such as #0b4f8a or rgb(11 79 138 / 50%)";
    case "fontSize":
    case "spacing":
    case "size":
    case "radius":
    case "border":
      return lengthOrZero(value) ? null : "Use a length such as 16px";
    case "letterSpacing":
      return lengthOrZero(value) || value === "normal"
        ? null
        : "Use a length such as -0.01em, or normal";
    case "lineHeight":
      return NUMBER.test(value) || lengthOrZero(value) || value === "normal"
        ? null
        : "Use a ratio such as 1.5, or a length such as 24px";
    case "fontWeight": {
      if (value === "normal" || value === "bold") return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 1000
        ? null
        : "Use a weight from 1 to 1000, e.g. 400 or 700";
    }
    case "fontFamily":
      return /^[\w\s"',.-]+$/.test(value) ? null : "Use font names separated by commas";
    case "shadow":
      return value === "none" || /^[\w\s#.,%()/+-]+$/.test(value)
        ? null
        : "Use a box-shadow such as 0 4px 12px rgb(0 0 0 / 12%)";
    case "zIndex":
      return /^-?\d+$/.test(value) ? null : "Use a whole number";
    case "duration":
      return /^(\d+\.?\d*|\.\d+)(ms|s)$/.test(value)
        ? null
        : "Use a duration such as 150ms or 0.2s";
  }
}

export const TOKEN_NAME = /^[a-z][a-z0-9-]{0,63}$/;
