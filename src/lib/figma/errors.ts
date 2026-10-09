export type FigmaErrorCode =
  | "no_token"
  | "invalid_token"
  | "no_access"
  | "missing_scope"
  | "not_found"
  | "plan_limit"
  | "rate_limited"
  | "network"
  | "server"
  | "bad_request";

const MESSAGES: Record<FigmaErrorCode, string> = {
  no_token: "No Figma token is saved. Add one in Settings.",
  invalid_token:
    "Figma rejected the token. It may be expired or revoked; save a new one in Settings.",
  no_access: "This Figma account cannot open that file. Ask the file owner to share it.",
  missing_scope:
    "The Figma token is missing a permission AuthorKit needs. Create a new token with read access to Current user, File content and Library content, then save it in Settings.",
  not_found: "Figma could not find that file or frame. Check the link.",
  plan_limit: "Figma variables need an Enterprise plan; AuthorKit will use styles instead.",
  rate_limited: "Figma is limiting requests right now. Wait a minute and try again.",
  network: "Cannot reach Figma. Check the network connection and try again.",
  server: "Figma had a problem handling the request. Try again shortly.",
  bad_request: "Figma did not accept the request.",
};

/**
 * Errors from the Figma API. Messages are fixed text: they never contain the
 * token, request headers or response bodies, so they are safe to show and log.
 */
export class FigmaError extends Error {
  constructor(
    readonly code: FigmaErrorCode,
    readonly status?: number,
  ) {
    super(MESSAGES[code]);
    this.name = "FigmaError";
  }
}
