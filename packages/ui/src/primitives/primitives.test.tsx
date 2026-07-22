import { UnknownNetworkProfileError } from "@tab/networks";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CopyControl,
  Dialog,
  EmptyState,
  ErrorState,
  EvidenceRail,
  LiveRegion,
  NetworkIdentity,
  Sheet,
  Skeleton,
  StatusBadge,
} from "../index.ts";

afterEach(cleanup);

function SurfaceHarness({ surface }: { surface: "dialog" | "sheet" }) {
  const [open, setOpen] = useState(false);
  const Surface = surface === "dialog" ? Dialog : Sheet;
  const name = surface === "dialog" ? "Dialog controls" : "Sheet controls";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open {surface}
      </button>
      <Surface
        description="Review the consequence before continuing."
        onDismiss={() => setOpen(false)}
        open={open}
        title={name}
      >
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Surface>
    </>
  );
}

describe("shared state primitives", () => {
  it("labels status and canonical network identity with words rather than color alone", () => {
    render(
      <>
        <StatusBadge tone="unavailable">Unavailable</StatusBadge>
        <NetworkIdentity profileId="eip155:42161" />
        <NetworkIdentity profileId="eip155:84532" />
      </>,
    );

    const badge = screen.getByText("Unavailable");
    expect(badge.getAttribute("data-tone")).toBe("unavailable");
    const network = screen.getByRole("group", { name: "Network: Arbitrum One" });
    expect(within(network).getByText("Arbitrum One")).toBeTruthy();
    expect(within(network).getByText("eip155:42161")).toBeTruthy();
    expect(within(network).queryByText(/^Arbitrum$/)).toBeNull();
    expect(within(network).queryByText("Testnet")).toBeNull();

    const testnet = screen.getByRole("group", { name: "Network: Base Sepolia" });
    expect(within(testnet).getByText("eip155:84532")).toBeTruthy();
    expect(within(testnet).getByText("Testnet")).toBeTruthy();
  });

  it("fails closed for an unknown network profile", () => {
    expect(() => render(<NetworkIdentity profileId={"eip155:999999" as never} />)).toThrow(
      UnknownNetworkProfileError,
    );
  });

  it("copies the exact value and politely announces contextual success", async () => {
    const user = userEvent.setup();
    const copyText = vi.fn().mockResolvedValue(undefined);
    render(
      <CopyControl
        copyText={copyText}
        failureMessage="Network identifier could not be copied"
        label="Copy network identifier"
        successMessage="Network identifier copied"
        value="eip155:42161"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy network identifier" }));

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith("eip155:42161");
    expect(screen.getByRole("status").textContent).toBe("Network identifier copied");
  });

  it("uses the platform clipboard when no copy adapter is supplied", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <CopyControl
          failureMessage="Identifier could not be copied"
          label="Copy identifier"
          successMessage="Identifier copied"
          value="opaque-value"
        />,
      );
      await user.click(screen.getByRole("button", { name: "Copy identifier" }));
      expect(writeText).toHaveBeenCalledWith("opaque-value");
      expect(screen.getByRole("status").textContent).toBe("Identifier copied");
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("announces copy-provider rejection as an urgent failure", async () => {
    const user = userEvent.setup();
    const copyText = vi.fn().mockRejectedValue(new Error("provider detail must stay private"));
    render(
      <CopyControl
        copyText={copyText}
        failureMessage="Identifier could not be copied"
        label="Copy identifier"
        successMessage="Identifier copied"
        value="opaque-value"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy identifier" }));

    expect(screen.getByRole("alert").textContent).toBe("Identifier could not be copied");
    expect(screen.queryByText(/provider detail/i)).toBeNull();
  });

  it("announces loading separately while skeleton geometry stays decorative and stable", () => {
    const { container } = render(
      <>
        <LiveRegion priority="polite">Loading account summary</LiveRegion>
        <Skeleton height="2.5rem" width="18rem" />
      </>,
    );

    const skeleton = container.querySelector<HTMLElement>("[data-tab-skeleton]");
    expect(skeleton).toBeTruthy();
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.style.getPropertyValue("--tab-skeleton-width")).toBe("18rem");
    expect(skeleton?.style.getPropertyValue("--tab-skeleton-height")).toBe("2.5rem");
    expect(
      container.querySelectorAll("a, button, input, select, textarea, [tabindex]"),
    ).toHaveLength(0);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading account summary");
  });

  it("keeps empty and error states distinct with a real next action", async () => {
    const user = userEvent.setup();
    const checkStatus = vi.fn();
    const { rerender } = render(
      <EmptyState
        action={<button type="button">Create endpoint</button>}
        description="No endpoints have been configured."
        title="No webhook endpoints"
      />,
    );

    expect(screen.getByRole("heading", { name: "No webhook endpoints" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create endpoint" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(
      <ErrorState
        action={
          <button type="button" onClick={checkStatus}>
            Check current status
          </button>
        }
        description="The latest observation could not be loaded. Retry safety is unknown."
        title="Could not refresh"
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check current status" }));
    expect(checkStatus).toHaveBeenCalledOnce();
  });

  it("renders caller-supplied Flowline evidence in order without inferring progress", () => {
    render(
      <EvidenceRail
        items={[
          { id: "identity", label: "Identity checked", state: "passed" },
          { id: "policy", label: "Policy waiting", state: "pending" },
          { id: "approval", label: "Approval blocked", state: "blocked" },
          { id: "provider", label: "Provider rejected", state: "failed" },
          { id: "settlement", label: "Settlement unavailable", state: "unavailable" },
          { id: "delivery", label: "Delivery not reached", state: "not-reached" },
        ]}
        label="Request evidence"
      />,
    );

    const rail = screen.getByRole("list", { name: "Request evidence" });
    expect(rail.tagName).toBe("OL");
    const items = within(rail).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual([
      "passed",
      "pending",
      "blocked",
      "failed",
      "unavailable",
      "not-reached",
    ]);
    expect(items.map((item) => item.textContent)).toEqual([
      "Identity checkedPassed",
      "Policy waitingPending",
      "Approval blockedBlocked",
      "Provider rejectedFailed",
      "Settlement unavailableUnavailable",
      "Delivery not reachedNot reached",
    ]);
    expect(rail.querySelector('[aria-current="step"]')).toBeNull();
  });

  it.each([
    "dialog",
    "sheet",
  ] as const)("keeps %s naming, description, focus trap, dismissal, and focus restoration accessible", async (surface) => {
    const user = userEvent.setup();
    render(<SurfaceHarness surface={surface} />);
    const opener = screen.getByRole("button", { name: `Open ${surface}` });
    await user.click(opener);

    const name = surface === "dialog" ? "Dialog controls" : "Sheet controls";
    const modal = screen.getByRole("dialog", { name });
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("data-surface")).toBe(surface);
    const descriptionId = modal.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "Review the consequence before continuing.",
    );

    const closeName = surface === "dialog" ? "Close dialog" : "Close sheet";
    const close = within(modal).getByRole("button", { name: closeName });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(modal).getByRole("button", { name: "Last action" }));
    await user.tab();
    expect(document.activeElement).toBe(close);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await user.click(opener);
    const reopened = screen.getByRole("dialog", { name });
    await user.click(within(reopened).getByRole("button", { name: closeName }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("uses polite status messages and assertive alerts for dynamic updates", () => {
    const { rerender } = render(<LiveRegion priority="polite">{null}</LiveRegion>);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("");

    rerender(<LiveRegion priority="polite">Checking readiness</LiveRegion>);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Checking readiness");

    rerender(<LiveRegion priority="urgent">Signing provider unavailable</LiveRegion>);
    const alert = screen.getByRole("alert");
    expect(alert).toBe(status);
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.getAttribute("aria-atomic")).toBe("true");
  });
});
