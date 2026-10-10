// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { FigmaLink, FrameMapping } from "@/lib/model";
import { MappingView } from "./MappingView";

const detect = vi.fn();
const previews = vi.fn();
const save = vi.fn();
vi.mock("./actions", () => ({
  detectFramesAction: (...a: unknown[]) => detect(...a),
  loadPreviewsAction: (...a: unknown[]) => previews(...a),
  saveMappingsAction: (...a: unknown[]) => save(...a),
}));

const m = (
  nodeId: string,
  nodeName: string,
  componentId: FrameMapping["componentId"],
): FrameMapping => ({
  nodeId,
  nodeName,
  path: `Home › ${nodeName}`,
  componentId,
  source: "pattern",
  reason: `Name is “${nodeName.toLowerCase()}”`,
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
    mappings: [m("4:10", "Header", "header"), m("4:15", "Footer", "footer")],
  },
  {
    id: "about",
    label: "About",
    scope: "page",
    pageName: "About",
    url: "https://www.figma.com/design/AbCdEf1234567890XyZ012/x?node-id=7-1",
    fileKey: "AbCdEf1234567890XyZ012",
    nodeId: "7:1",
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
      {...props}
    />,
  );
  return { panel: within(portal) };
}
const row = (name: string) => screen.getByText(name, { selector: "div" }).closest("li")!;

beforeEach(() => {
  document.body.innerHTML = "";
  [detect, previews, save].forEach((f) => f.mockReset());
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("MappingView", () => {
  it("lists only confirmed frames, with no suggestion states, filters or AI", () => {
    const { panel } = setup();
    expect(screen.getByRole("heading", { name: /Home desktop/ })).toHaveTextContent(
      "Page: Home · desktop",
    );
    expect(within(row("Header")).getByText("Name is “header”")).toBeInTheDocument();
    expect(within(row("Header")).getByLabelText("Component for Header")).toHaveValue("header");
    expect(screen.getByText(/No confirmed frames/)).toBeInTheDocument();
    for (const gone of [/Suggested/, /Confirm/, /Ignore/, /AI/, /Needs a decision/])
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /AI/ })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("changes a component and removes a frame, then saves only the changes", async () => {
    save.mockImplementation(async () => ({ ok: true, links, notes: [] }));
    const { panel } = setup();
    fireEvent.change(within(row("Header")).getByLabelText("Component for Header"), {
      target: { value: "isi" },
    });
    expect(within(row("Header")).getByText("Set by you")).toBeInTheDocument();
    fireEvent.click(within(row("Footer")).getByRole("button", { name: "Remove Footer" }));
    expect(screen.queryByText("Footer", { selector: "div" })).not.toBeInTheDocument();
    expect(panel.getByText("Unsaved changes")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save" }));
    });
    expect(save.mock.calls[0][1]).toEqual([
      { linkId: "home", nodeId: "4:10", componentId: "isi" },
      { linkId: "home", nodeId: "4:15", componentId: null },
    ]);
    expect(screen.getByText("Mappings saved.")).toBeInTheDocument();
  });

  it("discards changes", () => {
    const { panel } = setup();
    fireEvent.click(within(row("Footer")).getByRole("button", { name: "Remove Footer" }));
    fireEvent.click(panel.getByRole("button", { name: "Discard changes" }));
    expect(row("Footer")).toBeInTheDocument();
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("loads previews from allowed hosts only", async () => {
    previews.mockResolvedValue({
      ok: true,
      images: {
        "4:10": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4-10.png",
        "4:15": "https://evil.com/x.png",
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
    expect(row("Footer").querySelector("img")).toBeNull();
  });

  it("detects frames and shows the count and notes", async () => {
    detect.mockResolvedValue({ ok: true, links, notes: ["“file” links to a whole file."] });
    const { panel } = setup();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Detect frames" }));
    });
    expect(screen.getByText("Frames detected: 2 confirmed.")).toBeInTheDocument();
    expect(screen.getByText("“file” links to a whole file.")).toBeInTheDocument();
  });

  it("disables detection without a Figma connection", () => {
    const { panel } = setup({ figmaConnected: false });
    expect(panel.getByRole("button", { name: "Detect frames" })).toBeDisabled();
  });
});
