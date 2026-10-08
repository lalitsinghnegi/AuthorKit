// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/model";
import { UsersView } from "./UsersView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  createUserAction: vi.fn(async () => ({})),
  updateUserAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  deleteUserAction: vi.fn(),
}));

const user = (
  id: string,
  email: string,
  role: PublicUser["role"],
  disabled = false,
): PublicUser => ({
  id,
  email,
  name: email.split("@")[0],
  role,
  disabled,
  createdAt: "2026-10-01T00:00:00.000Z",
});

describe("UsersView", () => {
  it("lists users and protects your own row", () => {
    render(
      <UsersView
        users={[
          user("1", "ada@example.com", "admin"),
          user("2", "vic@example.com", "viewer", true),
        ]}
        currentUserId="1"
        minPasswordLength={12}
      />,
    );
    const [, mine, theirs] = screen.getAllByRole("row");
    expect(within(mine).getByText("you")).toBeInTheDocument();
    expect(within(mine).getByLabelText("Role for ada@example.com")).toBeDisabled();
    expect(within(mine).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(theirs).getByText("Disabled")).toBeInTheDocument();
    expect(within(theirs).getByRole("button", { name: "Enable" })).toBeEnabled();
    expect(within(theirs).getByLabelText("Role for vic@example.com")).toHaveValue("viewer");
    expect(screen.getByLabelText("Temporary password")).toHaveAttribute("minLength", "12");
  });
});
