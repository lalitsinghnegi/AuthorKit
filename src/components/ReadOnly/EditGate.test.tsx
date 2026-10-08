// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelActions, PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import { signInAs } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { AdminOnly, EditGate } from "./EditGate";

withTempDataDir();

const editor = (
  <>
    <input aria-label="Name" />
    <PanelActions>
      <button type="button">Save</button>
    </PanelActions>
  </>
);

async function renderGate() {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.append(portal);
  render(await EditGate({ children: editor }));
  return () => portal.remove();
}

describe("EditGate", () => {
  it("leaves the editor alone for admins", async () => {
    await signInAs("admin");
    const done = await renderGate();
    expect(screen.getByLabelText("Name")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByRole("note")).toBeNull();
    done();
  });

  it("disables every control for viewers, including panel actions", async () => {
    await signInAs("viewer");
    const done = await renderGate();
    expect(screen.getByRole("note")).toHaveTextContent("View only.");
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    done();
  });

  it("AdminOnly hides content from viewers", async () => {
    await signInAs("viewer");
    expect(await AdminOnly({ children: "Delete" })).toBeNull();
  });
});
