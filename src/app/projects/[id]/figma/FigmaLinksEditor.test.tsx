// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { FigmaLink } from "@/lib/model";
import { FigmaLinksEditor } from "./FigmaLinksEditor";

const save = vi.fn();
const remove = vi.fn();
const check = vi.fn();
vi.mock("./actions", () => ({
  saveFigmaLinkAction: (...a: unknown[]) => save(...a),
  deleteFigmaLinkAction: (...a: unknown[]) => remove(...a),
  checkFigmaLinkAction: (...a: unknown[]) => check(...a),
}));

const KEY = "AbCdEf1234567890XyZ012";
const URL_WITH_NODE = `https://www.figma.com/design/${KEY}/Acme?node-id=2-1`;
const existing: FigmaLink = {
  id: "l1",
  label: "Global styles",
  scope: "global",
  url: `https://www.figma.com/design/${KEY}/Acme?node-id=1-2`,
  fileKey: KEY,
  nodeId: "1:2",
};

function setup(props: Partial<React.ComponentProps<typeof FigmaLinksEditor>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(
    <FigmaLinksEditor
      projectId="p1"
      initialLinks={[existing]}
      breakpoints={[
        { id: "m", name: "mobile" },
        { id: "d", name: "desktop" },
      ]}
      figmaConnected
      {...props}
    />,
  );
  return { panel: within(portal) };
}

beforeEach(() => {
  document.body.innerHTML = "";
  save.mockReset();
  remove.mockReset();
  check.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("FigmaLinksEditor", () => {
  it("lists links", () => {
    setup();
    const row = screen.getByRole("row", { name: /Global styles/ });
    expect(row).toHaveTextContent("AbCdEf12… · 1:2");
    expect(row).toHaveTextContent("all");
  });

  it("parses the URL live and shows errors for other hosts", () => {
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Add link" }));
    const url = screen.getByLabelText("Figma link");

    fireEvent.change(url, { target: { value: "https://evil.com/design/x" } });
    expect(screen.getByText("Only figma.com links are allowed (got evil.com)")).toBeInTheDocument();
    expect(url).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(url, { target: { value: URL_WITH_NODE } });
    expect(screen.getByText(`File ${KEY} · frame 2:1`)).toBeInTheDocument();
  });

  it("shows page and component fields only for those scopes", () => {
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Add link" }));
    expect(screen.queryByLabelText("Page name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Page"));
    expect(screen.getByLabelText("Page name")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Component"));
    expect(screen.queryByLabelText("Page name")).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Component", { selector: "select" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).not.toContain("Design tokens");
  });

  it("checks a link and suggests the frame name as label", async () => {
    check.mockResolvedValue({
      ok: true,
      fileName: "Acme DS",
      nodeName: "Header / Desktop",
      nodeType: "FRAME",
    });
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Figma link"), { target: { value: URL_WITH_NODE } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check link" }));
    });
    expect(screen.getByText("Acme DS › Header / Desktop (frame)")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toHaveValue("Header / Desktop");
  });

  it("saves a component link with its breakpoint", async () => {
    save.mockResolvedValue({
      ok: true,
      links: [existing, { ...existing, id: "l2", label: "Header" }],
    });
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Figma link"), { target: { value: URL_WITH_NODE } });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Header" } });
    fireEvent.click(screen.getByLabelText("Component"));
    fireEvent.change(screen.getByLabelText("Component", { selector: "select" }), {
      target: { value: "header" },
    });
    fireEvent.change(screen.getByLabelText("Screen size this frame represents"), {
      target: { value: "d" },
    });
    await act(async () => {
      // The form's submit button, not the panel's "Add link".
      const form = screen.getByRole("region", { name: "Add a Figma link" });
      fireEvent.click(within(form).getByRole("button", { name: "Add link" }));
    });
    expect(save).toHaveBeenCalledWith("p1", {
      id: undefined,
      label: "Header",
      scope: "component",
      pageName: undefined,
      url: URL_WITH_NODE,
      breakpointId: "d",
      componentId: "header",
    });
    expect(screen.getByText("Links (2)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Figma link")).not.toBeInTheDocument();
  });

  it("shows server errors and disables Check without a token", async () => {
    save.mockResolvedValue({ ok: false, error: "Page links need a page name" });
    const { panel } = setup({ figmaConnected: false });
    expect(screen.getByText(/connect Figma in Settings/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Global styles" }));
    expect(screen.getByRole("button", { name: "Check link" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Page links need a page name");
    expect(panel.getByRole("button", { name: "Add link" })).toBeEnabled();
  });

  it("removes a link after confirming", async () => {
    remove.mockResolvedValue({ ok: true, links: [] });
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Global styles" }));
    });
    expect(remove).toHaveBeenCalledWith("p1", "l1");
    expect(screen.getByText("Links (0)")).toBeInTheDocument();
  });
});
