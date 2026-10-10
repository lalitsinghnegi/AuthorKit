/** Longest layer name AuthorKit keeps; stored schemas allow more, so notes that quote a name fit too. */
export const MAX_NAME_LENGTH = 120;

/**
 * A Figma layer name shortened for storage and display. Figma names text layers after their
 * content, so a paragraph of body copy can arrive as a name thousands of characters long.
 */
export function shortName(name: string, max = MAX_NAME_LENGTH): string {
  const flat = name.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
