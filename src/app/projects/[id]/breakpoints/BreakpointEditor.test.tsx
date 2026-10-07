// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import { BreakpointEditor } from "./BreakpointEditor";

const save = vi.fn();
vi.mock("./actions", () => ({ saveBreakpointsAction: (...args: unknown[]) => save(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const initial = [
  { id: "m", name: "mobile", maxWidth: 767 },
  { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
  { id: "d", name: "desktop", minWidth: 1024 },
];

function renderEditor() {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  const utils = render(
    <BreakpointEditor
      projectId="p1"
      prefix="acme"
      initialApproach="mobile-first"
      initialBreakpoints={initial}
    />,
  );
  return { ...utils, panel: within(portal) };
}

beforeEach(() => {
  save.mockReset();
  document.body.innerHTML = "";
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

const preview = () => screen.getByText(/base styles, no media query/).closest("code")!;

describe("BreakpointEditor", () => {
  it("shows a clean set with a mobile-first preview and Save disabled until edited", () => {
    const { panel } = renderEditor();
    expect(screen.getByText(/No overlaps, gaps or conflicts/)).toBeInTheDocument();
    expect(preview()).toHaveTextContent("@media (min-width: 768px)");
    expect(preview()).toHaveTextContent(".acme-example");
    expect(panel.getByRole("button", { name: "Save breakpoints" })).toBeDisabled();
  });

  it("flags the 1024px overlap, blocks saving, and fixes it with one click", () => {
    const { panel } = renderEditor();
    fireEvent.change(screen.getByLabelText("Max width of tablet in pixels"), {
      target: { value: "1024" },
    });
    expect(screen.getAllByText("tablet and desktop both match 1024px").length).toBeGreaterThan(0);
    expect(panel.getByText("Unsaved changes")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Save breakpoints" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "End tablet at 1023px" }));
    expect(screen.getByText(/No overlaps, gaps or conflicts/)).toBeInTheDocument();
    // Back to the saved values, so nothing to save.
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("Fix all resolves a gap", () => {
    const { panel } = renderEditor();
    fireEvent.change(screen.getByLabelText("Min width of desktop in pixels"), {
      target: { value: "1200" },
    });
    expect(screen.getAllByText("No breakpoint covers 1024px–1199px")).toHaveLength(3); // tablet row, desktop row, problems list
    fireEvent.click(panel.getByRole("button", { name: "Fix all" }));
    expect(screen.getByText(/No overlaps, gaps or conflicts/)).toBeInTheDocument();
  });

  it("reports non-numeric widths on the row", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Min width of tablet in pixels"), {
      target: { value: "7x" },
    });
    expect(screen.getByText("Enter a whole number of pixels")).toBeInTheDocument();
    expect(screen.getByLabelText("Min width of tablet in pixels")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("switching approach changes the preview to desktop-first", () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText(/^Desktop-first/));
    expect(preview()).toHaveTextContent("@media (max-width: 1023px)");
    expect(preview()).not.toHaveTextContent("min-width");
  });

  it("loads a preset and saves it", async () => {
    save.mockResolvedValue({ ok: true, savedAt: "now" });
    const { panel } = renderEditor();
    fireEvent.change(panel.getByLabelText("Load a preset"), { target: { value: "four-step" } });
    expect(screen.getByLabelText("Name of large")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save breakpoints" }));
    });
    expect(save).toHaveBeenCalledWith("p1", {
      approach: "mobile-first",
      breakpoints: {
        breakpoints: expect.arrayContaining([
          expect.objectContaining({ name: "large", minWidth: 1440 }),
        ]),
      },
    });
    expect(screen.getByText("Breakpoints saved.")).toBeInTheDocument();
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("shows server errors", async () => {
    save.mockResolvedValue({ ok: false, error: "This project no longer exists." });
    const { panel } = renderEditor();
    fireEvent.click(panel.getByRole("button", { name: "Add breakpoint" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove breakpoint" }));
    fireEvent.click(screen.getByLabelText(/^Desktop-first/));
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save breakpoints" }));
    });
    expect(screen.getByText("This project no longer exists.")).toBeInTheDocument();
  });

  it("adds a row, focuses it, and discards changes", () => {
    const { panel } = renderEditor();
    fireEvent.click(panel.getByRole("button", { name: "Add breakpoint" }));
    expect(screen.getByLabelText("Name of breakpoint")).toHaveFocus();
    fireEvent.click(panel.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Name of breakpoint")).not.toBeInTheDocument();
  });
});
