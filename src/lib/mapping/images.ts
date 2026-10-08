/** Hosts Figma serves rendered images from. Anything else is dropped, never rendered. */
const ALLOWED = [
  /^figma-alpha-api\.s3\.[a-z0-9-]+\.amazonaws\.com$/,
  /^([a-z0-9-]+\.)*figma\.com$/,
];

export function isAllowedImageUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ALLOWED.some((re) => re.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** Keep only image URLs from allowed hosts. */
export function safeImages(images: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(images).filter((e): e is [string, string] => isAllowedImageUrl(e[1])),
  );
}
