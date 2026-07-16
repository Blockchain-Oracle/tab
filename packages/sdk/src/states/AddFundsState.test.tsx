import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AddFundsState } from "./AddFundsState";

describe("AddFundsState", () => {
  it("keeps the address selectable and explains a clipboard rejection", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) },
    });

    render(
      <AddFundsState
        address="0x1111111111111111111111111111111111111111"
        onCancel={vi.fn()}
        onRecheck={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Copy didn’t work. Select and copy the address.",
    );
  });
});
