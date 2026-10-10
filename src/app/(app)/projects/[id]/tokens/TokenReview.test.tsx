// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { DesignToken } from "@/lib/model";
import { TokenReview } from "./TokenReview";

const extract = vi.fn();
const save = vi.fn();
vi.mock("./actions", () => ({
  extractTokensAction: (...a: unknown[]) => extract(...a),
  saveTokensAction: (...a: unknown[]) => save(...a),
}));

const meta = (
  patch: Partial<NonNullable<DesignToken["meta"]>> = {},
): NonNullable<DesignToken["meta"]> => ({
  sourceKey: "k",
  figmaName: "Brand/Primary",
  origin: "style",
  usage: 2,
  confidence: "high",
  reasons: [],
  mapped: true,
  ...patch,
});

const tokens: DesignToken[] = [
  {
    id: "1",
    name: "color-primary",
    type: "color",
    value: "#8a0b4f",
    originalValue: "#8a0b4f",
    status: "auto",
    source: { fileKey: "AbCdEf1234567890XyZ012", nodeId: "1:10", nodeName: "Primary" },
    meta: meta({ sourceKey: "a" }),
  },
  {
    id: "2",
    name: "color-teal",
    type: "color",
    value: "#009980",
    originalValue: "#009980",
    status: "auto",
    meta: meta({
      sourceKey: "b",
      figmaName: "Teal",
      confidence: "low",
      mapped: false,
      usage: 1,
      reasons: ["Used only once"],
    }),
  },
  {
    id: "3",
    name: "font-size-h1",
    type: "fontSize",
    value: "2.5rem",
    originalValue: "2.5rem",
    status: "accepted",
    meta: meta({ sourceKey: "c", figmaName: "Heading/H1" }),
  },
  {
    id: "4",
    name: "space-9",
    type: "spacing",
    value: "5rem",
    originalValue: "5rem",
    status: "auto",
    meta: meta({
      sourceKey: "d",
      figmaName: "Gap",
      missing: true,
      note: "No longer found in Figma",
      mapped: false,
    }),
  },
];

function setup(props: Partial<React.ComponentProps<typeof TokenReview>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(
    <TokenReview projectId="p1" initialTokens={tokens} figmaConnected sourceLinks={2} {...props} />,
  );
  return { panel: within(portal) };
}

const row = (name: string) => screen.getByDisplayValue(name).closest("tr")!;

beforeEach(() => {
  document.body.innerHTML = "";
  extract.mockReset();
  save.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("TokenReview", () => {
  it("groups tokens by type with previews, sources and notes", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Colors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Font sizes" })).toBeInTheDocument();
    expect(
      within(row("color-primary")).getByRole("link", { name: "Brand/Primary" }),
    ).toHaveAttribute("href", "https://www.figma.com/design/AbCdEf1234567890XyZ012?node-id=1-10");
    expect(within(row("color-primary")).getByText("fills the CSS")).toBeInTheDocument();
    expect(within(row("color-teal")).getByText("extra variable")).toBeInTheDocument();
    expect(within(row("color-teal")).getByText("Used only once")).toBeInTheDocument();
    expect(
      within(row("color-primary")).getByTitle("Contrast against the page background"),
    ).toHaveTextContent(/^\d+\.\d:1$/);
  });

  it("filters by review state, with no confidence filter or badge", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Low confidence/ })).not.toBeInTheDocument();
    expect(screen.queryByText("high")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "To review (3)" }));
    expect(screen.queryByDisplayValue("font-size-h1")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("color-primary")).toBeInTheDocument();
  });

  it("an edited value becomes an override and shows the Figma value", () => {
    const { panel } = setup();
    fireEvent.change(screen.getByLabelText("Value of color-primary"), {
      target: { value: "#000000" },
    });
    expect(within(row("color-primary")).getByText("Overridden")).toBeInTheDocument();
    expect(within(row("color-primary")).getByText("#8a0b4f")).toBeInTheDocument();
    expect(panel.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("blocks saving invalid values and duplicate names", () => {
    const { panel } = setup();
    fireEvent.change(screen.getByLabelText("Value of color-primary"), {
      target: { value: "red; }" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot contain/);
    expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Value of color-primary"), {
      target: { value: "#8a0b4f" },
    });
    fireEvent.change(screen.getByLabelText("Name for Teal"), {
      target: { value: "color-primary" },
    });
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
      "Another token is already named color-primary",
    );
  });

  it("accepts all tokens to review except missing ones", () => {
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Accept all" }));
    expect(within(row("color-primary")).getByText("Accepted")).toBeInTheDocument();
    expect(within(row("color-teal")).getByText("Accepted")).toBeInTheDocument();
    expect(within(row("space-9")).getByText("To review")).toBeInTheDocument();
  });

  it("excludes, resets and deletes missing tokens", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Exclude color-teal" }));
    expect(within(row("color-teal")).getByText("Excluded")).toBeInTheDocument();
    expect(screen.getByLabelText("Value of color-teal")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset font-size-h1" }));
    expect(within(row("font-size-h1")).getByText("To review")).toBeInTheDocument();
    expect(within(row("space-9")).getByText("No longer found in Figma")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete space-9" }));
    expect(screen.queryByDisplayValue("space-9")).not.toBeInTheDocument();
  });

  it("saves edits", async () => {
    save.mockImplementation(async (_id, edits) => ({
      ok: true,
      tokens: tokens.map((t) => ({ ...t, ...edits.find((e: { id: string }) => e.id === t.id) })),
    }));
    const { panel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept color-primary" }));
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Save" }));
    });
    expect(save.mock.calls[0][1][0]).toEqual({
      id: "1",
      name: "color-primary",
      value: "#8a0b4f",
      status: "accepted",
    });
    expect(screen.getByText("Tokens saved.")).toBeInTheDocument();
    expect(panel.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("extracts from Figma and shows the summary and notes", async () => {
    extract.mockResolvedValue({
      ok: true,
      tokens: tokens.slice(0, 1),
      summary: { added: 1, changed: 0, missing: 0, unchanged: 0 },
      notes: ["Variables unavailable"],
    });
    const { panel } = setup();
    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Extract from Figma" }));
    });
    expect(
      screen.getByText("Extracted from Figma: 1 new, 0 changed, 0 no longer found."),
    ).toBeInTheDocument();
    expect(screen.getByText("Variables unavailable")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("color-teal")).not.toBeInTheDocument();
  });

  it("explains why extraction is unavailable and lists template tokens on defaults", () => {
    const { panel } = setup({ figmaConnected: false, initialTokens: [] });
    expect(panel.getByRole("button", { name: "Extract from Figma" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Connect Figma in Settings" })).toBeInTheDocument();
    expect(screen.getByText(/77 template tokens will use AuthorKit defaults/)).toBeInTheDocument();
  });
});
