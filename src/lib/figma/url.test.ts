import { describe, expect, it } from "vitest";
import { parseFigmaUrl } from "./url";

const KEY = "AbCdEf1234567890XyZ012";

describe("parseFigmaUrl", () => {
  it.each([
    [
      `https://www.figma.com/design/${KEY}/Acme?node-id=12-34`,
      { fileKey: KEY, nodeId: "12:34", kind: "design", branch: false },
    ],
    [
      `https://figma.com/file/${KEY}/Acme?node-id=1%3A2`,
      { fileKey: KEY, nodeId: "1:2", kind: "file", branch: false },
    ],
    [
      `https://www.figma.com/proto/${KEY}/Acme?node-id=5-6&t=abc`,
      { fileKey: KEY, nodeId: "5:6", kind: "proto", branch: false },
    ],
    [
      `https://www.figma.com/board/${KEY}`,
      { fileKey: KEY, nodeId: undefined, kind: "board", branch: false },
    ],
    [
      `  https://WWW.FIGMA.COM/design/${KEY}/x  `,
      { fileKey: KEY, nodeId: undefined, kind: "design", branch: false },
    ],
    [
      `https://www.figma.com/design/${KEY}/branch/Br4nchKey123456789/Acme?node-id=7-8`,
      { fileKey: "Br4nchKey123456789", nodeId: "7:8", kind: "design", branch: true },
    ],
  ])("accepts %s", (url, expected) => {
    expect(parseFigmaUrl(url)).toEqual({ ok: true, ...expected });
  });

  it.each([
    ["", "Paste a Figma link"],
    ["not a url", "That is not a valid link"],
    [`http://www.figma.com/design/${KEY}`, "Use an https:// Figma link"],
    [`https://evil.com/design/${KEY}`, "Only figma.com links are allowed (got evil.com)"],
    [
      `https://figma.com.evil.com/design/${KEY}`,
      "Only figma.com links are allowed (got figma.com.evil.com)",
    ],
    [`https://evilfigma.com/design/${KEY}`, "Only figma.com links are allowed (got evilfigma.com)"],
    [
      `https://embed.figma.com/design/${KEY}`,
      "Only figma.com links are allowed (got embed.figma.com)",
    ],
    [
      `https://api.figma.com/v1/files/${KEY}`,
      "Only figma.com links are allowed (got api.figma.com)",
    ],
    [`https://user:pass@www.figma.com/design/${KEY}`, "Only plain figma.com links are allowed"],
    [`https://www.figma.com:8443/design/${KEY}`, "Only plain figma.com links are allowed"],
    [`https://www.figma.com/embed?url=x`, "Use a link to a Figma design file (figma.com/design/…)"],
    [
      `https://www.figma.com/files/recent`,
      "Use a link to a Figma design file (figma.com/design/…)",
    ],
    ["https://www.figma.com/design/short", "The link does not contain a valid file key"],
    [
      `https://www.figma.com/design/${KEY}/branch/`,
      "The branch link does not contain a valid branch key",
    ],
    [
      `https://www.figma.com/design/${KEY}/x?node-id=abc`,
      '"abc" is not a valid node id; select a frame and copy its link',
    ],
    [
      `https://www.figma.com/design/${KEY}/x?node-id=1-2-3`,
      '"1-2-3" is not a valid node id; select a frame and copy its link',
    ],
    ["javascript:alert(1)", "Use an https:// Figma link"],
  ])("rejects %j", (url, error) => {
    expect(parseFigmaUrl(url)).toEqual({ ok: false, error });
  });
});
