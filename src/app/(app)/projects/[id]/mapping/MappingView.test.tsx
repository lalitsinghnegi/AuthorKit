// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { FigmaLink, FrameMapping } from "@/lib/model";
import { MappingView } from "./MappingView";

const detect = vi.fn();
const previews = vi.fn();
const ai = vi.fn();
const save = vi.fn();
vi.mock("./actions", () => ({
  detectFramesAction: (...a: unknown[]) => detect(...a),
  loadPreviewsAction: (...a: unknown[]) => previews(...a),
  suggestWithAIAction: (...a: unknown[]) => ai(...a),
  saveMappingsAction: (...a: unknown[]) => save(...a),
}));

const m = (nodeId: string, nodeName: string, patch: Partial<FrameMapping> = {}): FrameMapping => ({
  nodeId,
  nodeName,
  path: `Home › ${nodeName}`,
  componentId: null,
  state: "suggested",
  source: "pattern",
  confidence: "low",
  reason: "No name pattern matches",
  ...patch,
});

const links: FigmaLink[] = [
  {
    id: "home",
    label: "Home desktop",
    scope: "page",
    pageName: "Home",
    url: "https://www.figma.com/design/AbCdEf1234567890XyZ012/x?node-id=4-1",
    fileKey: "AbCdEf1234567890XyZ012",
    nodeId: "4:1",
    breakpointId: "d",
    mappings: [
      m("4:10", "Header", {
        componentId: "header",
        confidence: "high",
        reason: "Name is “header”",
      }),
      m("4:13", "Frame 12"),
      m("4:15", "Footer", {
        componentId: "footer",
        state: "confirmed",
        confidence: "high",
        reason: "Name is “footer”",
      }),
    ],
  },
];

function setup(props: Partial<React.ComponentProps<typeof MappingView>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(
    <MappingView
      projectId="p1"
      initialLinks={links}
      breakpoints={{ d: "desktop" }}
      figmaConnected
      aiConfigured
      {...props}
    />,
  );
  return { panel: within(portal) };
}
const row = (name: string) => screen.getByText(name, { selector: "div" }).closest("li")!;

beforeEach(() => {
  document.body.innerHTML = "";
  [detect, previews, ai, save].forEach((f) => f.mockReset());
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("MappingView", () => {
  it("shows each link's frames with suggestions, badges and states", () => {
    const { panel } = setup();
    expect(screen.getByRole("heading", { name: /Home desktop/ })).toHaveTextContent(
      "Page: Home · desktop",
    );
    expect(within(row("Header")).getByText("Name is “header”")).toBeInTheDocument();
    expect(within(row("Header")).getByLabelText("Component for Header")).toHaveValue("header");
    expect(within(row("Footer")).getByText("Confirmed")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Ask AI about ambiguous (1)" })).toBeEnabled();
  });

  it("filters frames", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Confirmed (1)" }));
    expect(screen.queryByText("Header", { selector: "div" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ambiguous (1)" }));
    expect(screen.getByText("Frame 12", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText("Footer", { selector: "div" })).not.toBeInTheDocument();
  });

  it("confirms, ignores, changes and undoes", () => {
    const { panel } = setup();
    expect(
      within(row("Frame 12")).getByRole("button", { name: "Confirm Frame 12" }),
    ).toBeDisabled();
    fireEvent.change(within(row("Frame 12")).getByLabelText("Component for Frame 12"), {
      target: { value: "accordion" },
    });
    expect(within(row("Frame 12")).getByText("Confirmed")).toBeInTheDocument();
    expect(within(row("Frame 12")).getByText("You")).toBeInTheDocument();
    fireEvent.click(within(row("Header")).getByRole("button", { name: "Ignore Header" }));
    expect(within(row("Header")).getByText("Ignored")).toBeInTheDocument();
    fireEvent.click(within(row("Header")).getByRole("button", { name: "Undo Header" }));
    expect(within(row("Header")).getByText("Suggested")).toBeInTheDocument();
    expect(panel.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("confirms all high-confidence suggestions and saves", async () => {
    save.mockImplementation(async () => ({ ok: true, links, notes: [] }));
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Confirm all high-confidence" }));
    expect(within(row("Header")).getByText("Confirmed")).toBeInTheDocument();
    expect(within(row("Frame 12")).getByText("Suggested")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save" }));
    });
    expect(save.mock.calls[0][1]).toContainEqual({
      linkId: "home",
      nodeId: "4:10",
      componentId: "header",
      state: "confirmed",
    });
    expect(screen.getByText("Mappings saved.")).toBeInTheDocument();
  });

  it("loads previews from allowed hosts only", async () => {
    previews.mockResolvedValue({
      ok: true,
      images: {
        "4:10": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4-10.png",
        "4:13": "https://evil.com/x.png",
      },
    });
    const { panel } = setup();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Load previews" }));
    });
    expect(row("Header").querySelector("img")).toHaveAttribute(
      "src",
      "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4-10.png",
    );
    expect(row("Frame 12").querySelector("img")).toBeNull();
  });

  it("detects frames and asks AI, showing results and notes", async () => {
    detect.mockResolvedValue({ ok: true, links, notes: ["“file” links to a whole file."] });
    ai.mockResolvedValue({ ok: true, links, suggested: 2, notes: [] });
    const { panel } = setup();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Detect frames" }));
    });
    expect(screen.getByText("Frames detected.")).toBeInTheDocument();
    expect(screen.getByText("“file” links to a whole file.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Ask AI about ambiguous (1)" }));
    });
    expect(
      screen.getByText("AI suggested components for 2 frames. Review and confirm them."),
    ).toBeInTheDocument();
  });

  it("disables AI and detection when they are not configured", () => {
    const { panel } = setup({ aiConfigured: false, figmaConnected: false });
    expect(panel.getByRole("button", { name: "Ask AI about ambiguous (1)" })).toBeDisabled();
    expect(panel.getByRole("button", { name: "Detect frames" })).toBeDisabled();
    expect(panel.getByText("AI suggestions are off.")).toBeInTheDocument();
  });
});
