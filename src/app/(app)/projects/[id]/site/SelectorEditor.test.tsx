// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { SiteSuggestion } from "@/lib/model";
import { SelectorEditor, type EditorRow } from "./SelectorEditor";

const save = vi.fn();
vi.mock("./actions", () => ({ saveSiteSelectorsAction: (...a: unknown[]) => save(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const rows: EditorRow[] = [
  {
    componentId: "accordion",
    componentName: "Accordion",
    part: "accordion",
    kind: "block",
    purpose: "Container",
  },
  {
    componentId: "accordion",
    componentName: "Accordion",
    part: "accordion__trigger",
    kind: "element",
    purpose: "Toggle",
  },
  {
    componentId: "accordion",
    componentName: "Accordion",
    part: "accordion__icon",
    kind: "element",
    purpose: "Chevron",
  },
];
const s = (selector: string, confidence: SiteSuggestion["confidence"]): SiteSuggestion => ({
  selector,
  confidence,
  count: 2,
  pages: [0],
  reason: "Component and part both match",
  sample: `<div class="${selector.slice(1)}">`,
});
const suggestions = {
  accordion: [s(".cmp-accordion", "high"), s(".accordion", "high")],
  accordion__trigger: [s(".cmp-accordion__button", "high")],
  accordion__icon: [s(".cmp-accordion__icon", "medium")],
};

function setup(props: Partial<React.ComponentProps<typeof SelectorEditor>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(
    <SelectorEditor
      projectId="p1"
      prefix="ak"
      rows={rows}
      suggestions={suggestions}
      found={["accordion", "cmp-accordion", "cmp-accordion__button", "cmp-accordion__icon"]}
      {...props}
    />,
  );
  return { panel: within(portal) };
}

beforeEach(() => {
  document.body.innerHTML = "";
  save.mockReset();
});

describe("SelectorEditor", () => {
  it("prefills suggestions, confirms high-confidence ones and saves only decisions", async () => {
    save.mockResolvedValue({ ok: true });
    const { panel } = setup();
    expect(screen.getByLabelText(".ak-accordion__trigger")).toHaveValue(".cmp-accordion__button");
    expect(panel.getByRole("button", { name: "Save mappings" })).toBeDisabled();

    fireEvent.click(panel.getByRole("button", { name: "Confirm all high-confidence" }));
    expect(screen.getByLabelText("Use for .ak-accordion")).toHaveValue("confirmed");
    expect(screen.getByLabelText("Use for .ak-accordion__icon")).toHaveValue("open");
    fireEvent.click(screen.getByLabelText(/Use site selectors/));
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save mappings" }));
    });
    expect(save).toHaveBeenCalledWith("p1", {
      enabled: true,
      mappings: [
        {
          componentId: "accordion",
          part: "accordion",
          state: "confirmed",
          scoped: false,
          selector: ".cmp-accordion",
        },
        {
          componentId: "accordion",
          part: "accordion__trigger",
          state: "confirmed",
          scoped: false,
          selector: ".cmp-accordion__button",
        },
      ],
    });
    expect(screen.getByRole("status")).toHaveTextContent(/now uses the confirmed site classes/);
  });

  it("offers other candidates, scopes elements only once the block is confirmed, and warns", () => {
    setup();
    const scope = () => screen.getAllByLabelText(/Only inside the block/)[0];
    expect(scope()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Use for .ak-accordion"), {
      target: { value: "confirmed" },
    });
    expect(scope()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Use .accordion" }));
    expect(screen.getByLabelText(".ak-accordion")).toHaveValue(".accordion");

    fireEvent.change(screen.getByLabelText(".ak-accordion__icon"), { target: { value: ".gone" } });
    fireEvent.change(screen.getByLabelText("Use for .ak-accordion__icon"), {
      target: { value: "confirmed" },
    });
    expect(screen.getByText("Not found on the pages read last time.")).toBeInTheDocument();
  });

  it("shows problems from the server next to the part", async () => {
    save.mockResolvedValue({
      ok: false,
      error: "Fix the problems shown in the table to save.",
      problems: [{ part: "accordion__trigger", message: ".cmp-x is also used for .ak-accordion." }],
    });
    const { panel } = setup({
      saved: {
        enabled: false,
        mappings: [
          {
            componentId: "accordion",
            part: "accordion__trigger",
            state: "confirmed",
            selector: ".cmp-x",
            scoped: false,
          },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Use for .ak-accordion"), {
      target: { value: "confirmed" },
    });
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save mappings" }));
    });
    expect(screen.getByText(".cmp-x is also used for .ak-accordion.")).toBeInTheDocument();
    expect(screen.getByLabelText(".ak-accordion__trigger")).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses an invalid class before calling the server", () => {
    const { panel } = setup();
    fireEvent.change(screen.getByLabelText(".ak-accordion"), { target: { value: "not a class" } });
    fireEvent.change(screen.getByLabelText("Use for .ak-accordion"), {
      target: { value: "confirmed" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Save mappings" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Use one class selector, such as .cmp-button.")).toBeInTheDocument();
  });
});
