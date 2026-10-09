/**
 * HTTP security headers. Pure so they can be unit-tested; next.config.ts
 * applies them and the style guide route sets its own policy.
 *
 * The app uses Partial Prerendering, which cannot carry per-request nonces,
 * so Next.js' inline bootstrap scripts need 'unsafe-inline'. Everything else
 * is restricted to this origin: no third-party scripts, no plugins, no
 * framing by other sites, forms only post back here.
 */
const policy = (directives: Record<string, string[]>) =>
  Object.entries(directives)
    .map(([k, v]) => [k, ...v].join(" "))
    .join("; ");

/**
 * Figma's image CDN, for frame previews on the Components screen. CSP cannot
 * express the region wildcard in "figma-alpha-api.s3.<region>.amazonaws.com",
 * so images may come from any S3 host; isAllowedImageUrl still filters every URL.
 */
const FIGMA_IMAGES = ["https://*.figma.com", "https://*.amazonaws.com"];

export function appCsp(dev: boolean): string {
  return policy({
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...FIGMA_IMAGES],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "frame-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  });
}

/**
 * The generated style guide and package files, shown in an iframe on the
 * Style guide screen. Only the guide's own script runs; inline styles and
 * data: images are needed by the examples. It may be framed by this app only.
 */
export const STYLE_GUIDE_CSP = policy({
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'none'"],
  "frame-src": ["'self'"],
  "frame-ancestors": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
});

export function commonHeaders(prod: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // HTTPS is terminated by the proxy in front of the app; only promise it in production.
    ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}
