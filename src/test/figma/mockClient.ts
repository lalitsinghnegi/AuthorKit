import type { FigmaClient } from "@/lib/figma/client";
import { FigmaError, type FigmaErrorCode } from "@/lib/figma/errors";
import type {
  FigmaFile,
  FigmaImagesResponse,
  FigmaMe,
  FigmaNode,
  FigmaStylesResponse,
  FigmaVariablesResponse,
} from "@/lib/figma/types";
import file from "../fixtures/figma/file.json";
import images from "../fixtures/figma/images.json";
import me from "../fixtures/figma/me.json";
import styles from "../fixtures/figma/styles.json";
import variables from "../fixtures/figma/variables.json";

/** The file key the fixtures describe. */
export const FIXTURE_FILE_KEY = "AbCdEf1234567890XyZ012";
export const FIXTURE_URL = `https://www.figma.com/design/${FIXTURE_FILE_KEY}/Acme-Health`;

export type MockOptions = {
  /** Make every call (or the named method) fail with this error code. */
  failWith?: FigmaErrorCode;
  failOn?: (keyof FigmaClient)[];
};

function findNode(node: FigmaNode, id: string): FigmaNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** A FigmaClient backed by saved JSON fixtures. Records every call for assertions. */
export class MockFigmaClient implements FigmaClient {
  readonly calls: { method: keyof FigmaClient; args: unknown[] }[] = [];
  constructor(private readonly options: MockOptions = {}) {}

  private record(method: keyof FigmaClient, args: unknown[], fileKey?: string) {
    this.calls.push({ method, args });
    const { failWith, failOn } = this.options;
    if (failWith && (!failOn || failOn.includes(method))) throw new FigmaError(failWith);
    if (fileKey !== undefined && fileKey !== FIXTURE_FILE_KEY)
      throw new FigmaError("not_found", 404);
  }

  async getMe(): Promise<FigmaMe> {
    this.record("getMe", []);
    return structuredClone(me);
  }

  async getFile(fileKey: string, options?: { depth?: number }): Promise<FigmaFile> {
    this.record("getFile", [fileKey, options], fileKey);
    return structuredClone(file) as FigmaFile;
  }

  async getNodes(fileKey: string, nodeIds: string[]) {
    this.record("getNodes", [fileKey, nodeIds], fileKey);
    const doc = (file as FigmaFile).document;
    return {
      name: file.name,
      nodes: Object.fromEntries(
        nodeIds.map((id) => {
          const node = findNode(doc, id);
          return [
            id,
            node ? { document: structuredClone(node), styles: structuredClone(file.styles) } : null,
          ];
        }),
      ),
    };
  }

  async getStyles(fileKey: string): Promise<FigmaStylesResponse> {
    this.record("getStyles", [fileKey], fileKey);
    return structuredClone(styles);
  }

  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    this.record("getLocalVariables", [fileKey], fileKey);
    return structuredClone(variables) as FigmaVariablesResponse;
  }

  async getImages(
    fileKey: string,
    nodeIds: string[],
    options?: object,
  ): Promise<FigmaImagesResponse> {
    this.record("getImages", [fileKey, nodeIds, options], fileKey);
    return {
      err: null,
      images: Object.fromEntries(
        nodeIds.map((id) => [id, (images.images as Record<string, string>)[id] ?? null]),
      ),
    };
  }
}
