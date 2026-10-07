// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { FolderNode } from "@/lib/model";
import { BASIC_PRESET } from "@/lib/scaffold";
import { ScaffoldEditor } from "./ScaffoldEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const tree = (): FolderNode => ({
  id: "root",
  type: "folder",
  name: "acme",
  children: [
    {
      id: "css",
      type: "folder",
      name: "css",
      children: [
        { id: "g", type: "file", name: "global.css", cssTemplateId: "global" },
        { id: "c", type: "file", name: "cta.css", cssTemplateId: "cta" },
      ],
    },
    {
      id: "js",
      type: "folder",
      name: "js",
      children: [{ id: "app", type: "file", name: "app.js", cssTemplateId: null }],
    },
  ],
});

const onSave = vi.fn();

function setup(props: Partial<React.ComponentProps<typeof ScaffoldEditor>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(<ScaffoldEditor initialTree={tree()} onSave={onSave} {...props} />);
  return { panel: within(portal) };
}

const preview = () =>
  screen.getByRole("region", { name: "Package preview" }).querySelector("code")!;

beforeEach(() => {
  document.body.innerHTML = "";
  onSave.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ScaffoldEditor", () => {
  it("renders the tree and a package preview", () => {
    setup();
    expect(screen.getByRole("button", { name: "Rename global.css" })).toBeInTheDocument();
    expect(preview().textContent).toContain("│   ├── global.css  ← global");
    expect(screen.getByText(/Not included: Design tokens/)).toBeInTheDocument();
  });

  it("adds a file in rename mode and validates the name live", () => {
    const { panel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add file in css" }));
    const input = screen.getByLabelText("New name for new-file.css");
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "my file.css" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Not allowed: space");
    fireEvent.change(input, { target: { value: "Global.css" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      '"Global.css" already exists in this folder',
    );

    fireEvent.change(input, { target: { value: "modals.css" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Rename modals.css" })).toBeInTheDocument();
    expect(panel.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("Escape cancels a rename", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename cta.css" }));
    const input = screen.getByLabelText("New name for cta.css");
    fireEvent.change(input, { target: { value: "x.css" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Rename cta.css" })).toBeInTheDocument();
  });

  it("assigns templates and shows errors that block saving", () => {
    const { panel } = setup();
    fireEvent.change(screen.getByLabelText("CSS template for app.js"), {
      target: { value: "isi" },
    });
    // Once on the row, once in the Problems list.
    expect(screen.getAllByText(/Files with a CSS template must end in \.css/)).toHaveLength(2);
    expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(panel.getByText("Fix the errors to save.")).toBeInTheDocument();
  });

  it("moves with ↑/↓ and Move to…, and undo/redo walk the history", () => {
    const { panel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Move cta.css up" }));
    expect(preview().textContent).toMatch(/cta\.css[\s\S]*global\.css/);

    fireEvent.change(screen.getByLabelText("Move app.js to folder"), { target: { value: "css" } });
    expect(preview().textContent).toMatch(/global\.css  ← global\n│   └── app\.js/);

    fireEvent.click(panel.getByRole("button", { name: "Undo" }));
    expect(preview().textContent).toMatch(/js\/\n    └── app\.js/);
    fireEvent.click(panel.getByRole("button", { name: "Undo" }));
    expect(preview().textContent).toMatch(/global\.css[\s\S]*cta\.css/);
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: "Redo" }));
    expect(preview().textContent).toMatch(/cta\.css[\s\S]*global\.css/);
  });

  it("does not offer moving a folder into itself", () => {
    setup();
    const options = within(screen.getByLabelText("Move css to folder"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Move to…", "acme/js/"]);
  });

  it("drag and drop moves a file into a folder", () => {
    setup();
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const row = (name: string) =>
      screen.getByRole("button", { name: `Rename ${name}` }).parentElement!;
    const target = screen.getByRole("button", { name: "Rename js" }).parentElement!;

    fireEvent.dragStart(row("global.css"), { dataTransfer });
    // jsdom has no layout, so the pointer position resolves to "inside" for folders.
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveAttribute("data-drop", "inside");
    fireEvent.drop(target, { dataTransfer });
    expect(preview().textContent).toMatch(/js\/\n    ├── app\.js\n    └── global\.css/);
  });

  it("deletes after confirming and applies a preset keeping the root name", () => {
    const { panel } = setup({ presets: [{ id: "basic", name: "Basic", tree: BASIC_PRESET.tree }] });
    fireEvent.click(screen.getByRole("button", { name: "Delete js" }));
    expect(window.confirm).toHaveBeenCalledWith('Delete "js" and everything in it?');
    expect(screen.queryByRole("button", { name: "Rename js" })).not.toBeInTheDocument();

    fireEvent.change(panel.getByLabelText("Apply a preset"), { target: { value: "basic" } });
    expect(preview().textContent).toMatch(/^acme\/\n└── css\/\n    ├── tokens\.css/);
  });

  it("saves the tree and meta, then clears the dirty state", async () => {
    const { panel } = setup({ initialMeta: { name: "Mine", description: "" } });
    fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Renamed" } });
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save" }));
    });
    expect(onSave).toHaveBeenCalledWith({ tree: tree(), name: "Renamed", description: "" });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("shows server errors", async () => {
    onSave.mockResolvedValue({ ok: false, error: "This project no longer exists." });
    const { panel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Move cta.css up" }));
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByText("This project no longer exists.")).toBeInTheDocument();
  });

  it("read-only mode has no editing controls or panel actions", () => {
    const { panel } = setup({ readOnly: true });
    expect(screen.queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getByText("global.css")).toBeInTheDocument();
    expect(panel.queryByRole("button")).not.toBeInTheDocument();
  });
});
