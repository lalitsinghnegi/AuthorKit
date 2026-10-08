/** Figma links AuthorKit accepts. Pure and browser-safe: the link form runs it live. */

export type FigmaUrlKind = "design" | "file" | "proto" | "board";
export type ParsedFigmaUrl = {
  fileKey: string;
  nodeId?: string;
  kind: FigmaUrlKind;
  branch: boolean;
};
export type ParseResult = ({ ok: true } & ParsedFigmaUrl) | { ok: false; error: string };

const HOSTS = new Set(["figma.com", "www.figma.com"]);
const KINDS = new Set<FigmaUrlKind>(["design", "file", "proto", "board"]);
const KEY = /^[A-Za-z0-9]{10,64}$/;
const NODE_ID = /^(\d+)[-:](\d+)$/;

export function parseFigmaUrl(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste a Figma link" };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That is not a valid link" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Use an https:// Figma link" };
  if (url.username || url.password || url.port)
    return { ok: false, error: "Only plain figma.com links are allowed" };
  if (!HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: `Only figma.com links are allowed (got ${url.hostname})` };
  }

  const [kind, key, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!KINDS.has(kind as FigmaUrlKind)) {
    return { ok: false, error: "Use a link to a Figma design file (figma.com/design/…)" };
  }
  if (!key || !KEY.test(key))
    return { ok: false, error: "The link does not contain a valid file key" };

  let fileKey = key;
  let branch = false;
  if (rest[0] === "branch") {
    if (!rest[1] || !KEY.test(rest[1]))
      return { ok: false, error: "The branch link does not contain a valid branch key" };
    fileKey = rest[1];
    branch = true;
  }

  const rawNode = url.searchParams.get("node-id");
  let nodeId: string | undefined;
  if (rawNode !== null) {
    const m = NODE_ID.exec(rawNode.trim());
    if (!m)
      return {
        ok: false,
        error: `"${rawNode}" is not a valid node id; select a frame and copy its link`,
      };
    nodeId = `${m[1]}:${m[2]}`;
  }
  return { ok: true, fileKey, nodeId, kind: kind as FigmaUrlKind, branch };
}
